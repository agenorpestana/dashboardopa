
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createServer as createViteServer } from 'vite';

const app = express();
const port = process.env.PORT || 3000;

// Vite middleware defined later

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'opadashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

async function initDB() {
  try {
    const connection = await pool.getConnection();
    await connection.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS settings (id INT AUTO_INCREMENT PRIMARY KEY, api_url VARCHAR(255), api_token TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', ['suporte']);
    if (rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('200616', salt);
      await connection.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['suporte', hash]);
    }
    connection.release();
  } catch (error) { console.error("Erro ao inicializar banco:", error.message); }
}
initDB();

app.use(cors());
app.use(express.json());


async function opaRequest(baseUrl, path, token, body = {}) {
  return new Promise((resolve) => {
    try {
      let finalUrlStr = baseUrl.replace(/\/$/, '');
      if (!finalUrlStr.endsWith(path)) finalUrlStr += path;
      
      const url = new URL(finalUrlStr);
      const lib = url.protocol === 'https:' ? https : http;
      
      const jsonBody = JSON.stringify(body);

      const options = {
        method: 'GET',
        headers: { 
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonBody)
        },
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        rejectUnauthorized: false,
        timeout: 60000 
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { 
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
                resolve({ ok: false, error: parsed, status: res.statusCode });
            } else {
                resolve({ ok: true, data: parsed }); 
            }
          }
          catch (e) { 
            resolve({ ok: false, error: 'JSON Parse Error', raw: data }); 
          }
        });
      });

      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout' });
      });

      req.write(jsonBody);
      req.end();
    } catch (e) { 
      resolve({ ok: false, error: e.message }); 
    }
  });
}

/**
 * Função para buscar dados com paginação automática
 */
async function fetchAllWithPagination(baseUrl, path, token, filter, maxRecords = 80000) {
  let allData = [];
  const requestLimit = 1000;
  let currentSkip = 0;
  let hasMore = true;
  const BATCH_SIZE = 5; // Configura para baixar 5 páginas (5000 registros) simultaneamente

  while (hasMore && allData.length < maxRecords) {
    console.log(`Buscando lote de blocos paralelos a partir do skip: ${currentSkip}...`);
    const promises = [];
    
    for (let i = 0; i < BATCH_SIZE; i++) {
      const skip = currentSkip + (i * requestLimit);
      if (skip >= maxRecords) break;
      
      promises.push(
        opaRequest(baseUrl, path, token, {
          filter,
          options: { 
            limit: requestLimit, 
            skip, 
            sort: { date: -1 },
            fields: ['_id', 'protocolo', 'date', 'fim', 'id_atendente', 'id_setor', 'id_motivo_atendimento', 'cliente_nome', 'isBot']
          }
        })
      );
    }

    if (promises.length === 0) break;

    const results = await Promise.all(promises);

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (!res.ok) {
        console.error(`Erro na paginação no lote:`, res.error);
        hasMore = false;
        break;
      }

      const data = (res.data?.status === "success") ? (res.data.data || []) : (Array.isArray(res.data) ? res.data : []);
      
      if (data.length === 0) {
        hasMore = false;
        break;
      } else {
        allData = allData.concat(data);
        if (data.length < requestLimit) {
           hasMore = false; // Se uma página não veio cheia, é a última
           break;
        }
      }
    }
    
    currentSkip += requestLimit * BATCH_SIZE;
  }

  return allData;
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    res.json({ success: true, username: user.username });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    res.json(rows[0] || {});
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar configurações' }); }
});

app.post('/api/settings', async (req, res) => {
  const { username, password, api_url, api_token } = req.body;
  try {
    const [userRows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = userRows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(403).json({ success: false });
    const [settingRows] = await pool.query('SELECT id FROM settings LIMIT 1');
    if (settingRows.length > 0) await pool.query('UPDATE settings SET api_url = ?, api_token = ? WHERE id = ?', [api_url, api_token, settingRows[0].id]);
    else await pool.query('INSERT INTO settings (api_url, api_token) VALUES (?, ?)', [api_url, api_token]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/debug-dump', async (req, res) => {
  try {
    const api_url = req.query.url;
    const api_token = req.query.token;
    if (!api_url || !api_token) return res.status(400).send('Missing url or token query params');
    let baseUrl = api_url.trim().replace(/\/$/, '');
    if (!baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
    
    const fileId = req.query.id || '6a0b5e687b773394b83d8ee0';
    
    const urlsToTest = [
      `${baseUrl}/arquivo/${fileId}`,
      `${baseUrl}/arquivos/${fileId}`,
      `${baseUrl}/arquivo/${fileId}/download`,
      `${baseUrl}/atendimento/arquivos/${fileId}`
    ];
    
    const results = [];
    for (const url of urlsToTest) {
      try {
        const fetchRes = await fetch(url, { headers: { 'Authorization': `Bearer ${api_token}` } });
        const type = fetchRes.headers.get('content-type');
        const isJson = type && type.includes('json');
        let data = '';
        if (isJson) {
          data = await fetchRes.json();
        } else {
          const text = await fetchRes.text();
          data = text.substring(0, 100);
        }
        results.push({ url, status: fetchRes.status, type: type, data });
      } catch (err) {
        results.push({ url, error: err.message });
      }
    }
    
    res.json({ results });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/dashboard-data', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    const config = rows[0];
    if (!config || !config.api_url) return res.status(400).json({ error: 'Configuração pendente' });
    
    let baseUrl = config.api_url.trim().replace(/\/$/, '');
    if (!baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
    const token = config.api_token;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const dateFilter = `${year}-${month}-01 00:00:00`;
    
    const ROBOT_ID = '5d1642ad4b16a50312cc8f4d';

    // 1. ATIVOS (Normalmente não passam de 1000, busca simples)
    const activeRes = await opaRequest(baseUrl, '/atendimento', token, {
      filter: { status: { $ne: 'F' } },
      options: { limit: 1000, sort: { date: -1 } }
    });

    // 2. FINALIZADOS (PAGINADOS para buscar todo o mês)
    const finishedTicketsRaw = await fetchAllWithPagination(
      baseUrl, 
      '/atendimento', 
      token, 
      {
        status: 'F',
        date: { $gte: dateFilter } 
      },
      80000 // Aumentado limite de segurança de 15000 para 80000 para cobrir 6 meses de dados
    );

    // 3. USUÁRIOS
    const userRes = await opaRequest(baseUrl, '/usuario', token, {
      options: { limit: 500 }
    });

    // 4. DEPARTAMENTOS
    const deptRes = await opaRequest(baseUrl, '/departamento', token, {
        options: { limit: 500 }
    });

    // 5. PERÍODOS
    const periodRes = await opaRequest(baseUrl, '/atendimento/periodo', token, {
        options: { limit: 100 }
    });

    const getList = (res) => {
      if (res && res.ok && res.data?.status === "success") return res.data.data || [];
      if (res && res.ok && Array.isArray(res.data)) return res.data;
      return [];
    };

    const isRobot = (t) => {
      const attId = typeof t.id_atendente === 'object' ? String(t.id_atendente?._id || '') : String(t.id_atendente || '');
      const attName = typeof t.id_atendente === 'object' ? String(t.id_atendente?.nome || '') : '';
      return attId === ROBOT_ID || attName.toLowerCase().includes('robô') || attName.toLowerCase().includes('robot');
    };

    const sortByDateDesc = (a, b) => {
        const dateA = new Date(String(a.date || '').replace(' ', 'T')).getTime();
        const dateB = new Date(String(b.date || '').replace(' ', 'T')).getTime();
        return dateB - dateA;
    };

    const rawActive = getList(activeRes).sort(sortByDateDesc);
    const rawFinished = finishedTicketsRaw.sort(sortByDateDesc);
    
    // Add isBot flag to every ticket so the frontend can check it
    const enhancedActive = rawActive.map(t => ({ ...t, isBot: isRobot(t) }));
    const enhancedFinished = rawFinished.map(t => ({ ...t, isBot: isRobot(t) }));
    
    const departments = getList(deptRes);
    const periods = getList(periodRes);

    const attendants = getList(userRes).filter(a => {
        const id = String(a._id || a.id);
        const nome = String(a.nome || '');
        return id !== ROBOT_ID && !nome.toLowerCase().includes('robô');
    });

    res.json({
      success: true,
      pagination: { totalFetched: enhancedFinished.length },
      tickets: [...enhancedActive, ...enhancedFinished],
      attendants: attendants,
      departments: departments,
      periods: periods
    });

  } catch (error) { 
    res.status(500).json({ success: false, error: error.message }); 
  }
});

app.get('/api/media-proxy', async (req, res) => {
  try {
    const mediaUrl = req.query.url;
    let fileId = req.query.id;
    let token = req.query.token;
    let baseUrlParam = req.query.baseUrl;
    
    // Extrait MongoDB ObjectId from URL to fetch metadata via API 
    // avoiding the HTML login page on web endpoints
    if (mediaUrl && !fileId) {
       const match = mediaUrl.match(/[a-fA-F0-9]{24}/);
       if (match) fileId = match[0];
    }
    
    if (!mediaUrl && !fileId) return res.status(400).send('URL or ID missing');

    let config = {};
    if (!token) {
        try {
            const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
            config = rows[0] || {};
            token = config.api_token;
        } catch(e) {
            console.error("DB skip", e.message);
        }
    }
    
    const finalToken = token || '';
    let baseUrl = baseUrlParam || config.api_url || '';
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    if (baseUrl && !baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
    
    let targetUrl = mediaUrl;
    
    // Tentativa 1: Fazer POST para buscar metadados do arquivo se for um ID
    if (fileId) {
      let baseUrl = config?.api_url?.trim().replace(/\/$/, '') || '';
      if (!baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
      targetUrl = `${baseUrl}/arquivo/${fileId}`; // Mantém o GET normal como fallback

      try {
        console.log("Tentando buscar metadados do arquivo via POST na API...");
        const metaRes = await fetch(`${baseUrl}/arquivo`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ filter: { _id: fileId } })
        });
        const metaJson = await metaRes.json();
        if (metaJson.data && metaJson.data.length > 0) {
           const fileData = metaJson.data[0];
           console.log("Metadados do arquivo encontrados:", { url: fileData.url, url_s3: fileData.url_s3 });
           if (fileData.url_s3) {
             targetUrl = fileData.url_s3;
           } else if (fileData.url) {
             targetUrl = fileData.url;
           } else if (fileData.base64) {
             const buffer = Buffer.from(fileData.base64, 'base64');
             res.setHeader('Content-Type', fileData.tipo || 'application/octet-stream');
             return res.send(buffer);
           }
        }
      } catch (e) {
        console.error("Falha ao bucar metadados do arquivo via POST:", e);
      }
    }

    console.log("Media Proxy Redirecting to:", targetUrl);
    
    // As the files are protected by the user's session cookies on the Opa Suite domain,
    // we cannot proxy them via a server-side fetch with a Bearer token (which returns an HTML login page).
    // Instead, we redirect the browser to the actual URL so it uses the S3 public link 
    // or native cookies for authentication.
    return res.redirect(targetUrl);
  } catch (error) {
    console.error('Media proxy error:', error);
    res.status(500).json({ error: String(error), stack: error?.stack });
  }
});

app.get('/api/ticket-details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    const config = rows[0];
    if (!config || !config.api_url) return res.status(400).json({ error: 'Configuração pendente' });
    
    let baseUrl = config.api_url.trim().replace(/\/$/, '');
    if (!baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
    const token = config.api_token;

    const result = await opaRequest(baseUrl, `/atendimento/${id}`, token);
    if (!result.ok) {
      return res.status(500).json({ success: false, error: result.error });
    }
    
    res.json({ success: true, data: result.data?.data || result.data || {} });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ticket-messages/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    const config = rows[0];
    if (!config || !config.api_url) return res.status(400).json({ error: 'Configuração pendente' });
    
    let baseUrl = config.api_url.trim().replace(/\/$/, '');
    if (!baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
    const token = config.api_token;

    const result = await opaRequest(baseUrl, `/atendimento/mensagem`, token, {
      filter: { id_rota: routeId },
      options: { limit: 1000 }
    });

    if (!result.ok) {
      return res.status(500).json({ success: false, error: result.error });
    }
    
    res.json({ success: true, data: result.data?.data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
  }

  app.listen(port, "0.0.0.0", () => console.log(`Backend rodando na porta ${port}`));
}
startServer();
