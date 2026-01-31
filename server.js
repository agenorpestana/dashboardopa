
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const port = process.env.PORT || 3000;

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
    // @ts-ignore
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
app.use(express.static(join(__dirname, 'dist')));

function opaRequest(baseUrl, path, token, params = {}) {
  return new Promise((resolve) => {
    try {
      // Normalização: Se a URL já termina com o path, não duplica
      let finalUrlStr = baseUrl;
      if (!finalUrlStr.endsWith(path)) {
          finalUrlStr = `${baseUrl}${path}`;
      }
      
      const url = new URL(finalUrlStr);
      
      const loopbackFilter = {
        where: params.filter || {},
        limit: params.options?.limit || 1000,
        skip: params.options?.skip || 0,
        order: params.options?.sort ? 
          (params.options.sort.startsWith('-') ? `${params.options.sort.substring(1)} DESC` : `${params.options.sort} ASC`) : 
          "_id DESC",
        include: params.options?.populate || []
      };

      url.searchParams.append('filter', JSON.stringify(loopbackFilter));

      const lib = url.protocol === 'https:' ? https : http;
      const options = {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        rejectUnauthorized: false
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
      req.end();
    } catch (e) { 
      resolve({ ok: false, error: e.message }); 
    }
  });
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    // @ts-ignore
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
    // @ts-ignore
    const user = userRows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(403).json({ success: false });
    const [settingRows] = await pool.query('SELECT id FROM settings LIMIT 1');
    // @ts-ignore
    if (settingRows.length > 0) await pool.query('UPDATE settings SET api_url = ?, api_token = ? WHERE id = ?', [api_url, api_token, settingRows[0].id]);
    else await pool.query('INSERT INTO settings (api_url, api_token) VALUES (?, ?)', [api_url, api_token]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/dashboard-data', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    // @ts-ignore
    const config = rows[0];
    if (!config || !config.api_url) return res.status(400).json({ error: 'Configuração ausente' });
    
    // Limpeza da URL para garantir que termina corretamente
    let baseUrl = config.api_url.trim().replace(/\/$/, '');
    if (!baseUrl.includes('/api/v1')) {
        baseUrl += '/api/v1';
    }
    
    const token = config.api_token;
    const populate = ["id_cliente", "id_atendente", "id_motivo_atendimento", "setor", "id_contato"];

    console.log(`[Proxy] Buscando dados em: ${baseUrl}`);

    // Chamadas mais simples para evitar erros de filtro rígido
    const [activeRes, historyRes, uRes, clientRes, contactRes] = await Promise.all([
      opaRequest(baseUrl, '/atendimento', token, {
        filter: { status: { "neq": "F" } }, // Apenas não-finalizados
        options: { limit: 500, populate: populate }
      }),
      opaRequest(baseUrl, '/atendimento', token, {
        filter: { status: "F" }, // Apenas finalizados
        options: { limit: 1000, populate: populate, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/usuario', token, {
        filter: { status: "A" },
        options: { limit: 200 }
      }),
      opaRequest(baseUrl, '/cliente', token, {
        options: { limit: 500, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/contato', token, {
        options: { limit: 500, sort: "-_id" }
      })
    ]);

    const getList = (res, name) => {
      if (!res.ok) {
        console.warn(`[Proxy] Erro em ${name}:`, res.error);
        return [];
      }
      const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
      console.log(`[Proxy] ${name} retornou ${list.length} itens.`);
      return list;
    };

    const tickets = [...getList(activeRes, "Ativos"), ...getList(historyRes, "Histórico")];

    res.json({
      success: true,
      tickets: tickets,
      attendants: getList(uRes, "Atendentes"),
      clients: getList(clientRes, "Clientes"),
      contacts: getList(contactRes, "Contatos")
    });

  } catch (error) { 
    console.error(`[Proxy Fatal]`, error.message);
    res.status(500).json({ error: error.message }); 
  }
});

app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
app.listen(port, () => console.log(`Backend rodando na porta ${port}`));
