
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

async function opaRequest(baseUrl, path, token, params = {}) {
  return new Promise((resolve) => {
    try {
      let finalUrlStr = baseUrl.replace(/\/$/, '');
      if (!finalUrlStr.endsWith(path)) finalUrlStr += path;
      
      const url = new URL(finalUrlStr);
      
      const loopbackFilter = {
        where: params.filter || {},
        limit: params.options?.limit || 100,
        order: "_id DESC",
        include: params.options?.populate || []
      };

      url.searchParams.append('filter', JSON.stringify(loopbackFilter));

      const lib = url.protocol === 'https:' ? https : http;
      const options = {
        method: 'GET',
        headers: { 
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Accept': 'application/json'
        },
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        rejectUnauthorized: false,
        timeout: 10000
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { 
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) resolve({ ok: false, error: parsed, status: res.statusCode });
            else resolve({ ok: true, data: parsed }); 
          }
          catch (e) { resolve({ ok: false, error: 'JSON Parse Error', raw: data }); }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
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

app.get('/api/dashboard-data', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    const config = rows[0];
    if (!config || !config.api_url) return res.status(400).json({ error: 'Configuração pendente' });
    
    let baseUrl = config.api_url.trim().replace(/\/$/, '');
    if (!baseUrl.includes('/api/v1')) baseUrl += '/api/v1';
    
    const token = config.api_token;
    const populate = ["id_cliente", "id_atendente", "id_motivo_atendimento", "setor", "id_contato"];

    // 1. Tenta buscar ativos com filtro
    let activeRes = await opaRequest(baseUrl, '/atendimento', token, {
      filter: { status: { "neq": "F" } },
      options: { limit: 200, populate }
    });

    // 2. Se falhar ou vier vazio, tenta buscar TUDO sem filtro (Fallback)
    if (!activeRes.ok || (activeRes.data?.data?.length === 0 && !Array.isArray(activeRes.data))) {
       console.log("[Proxy] Fallback: Tentando busca sem filtros...");
       activeRes = await opaRequest(baseUrl, '/atendimento', token, {
         options: { limit: 100, populate }
       });
    }

    const [uRes, historyRes] = await Promise.all([
      opaRequest(baseUrl, '/usuario', token, { filter: { status: "A" }, options: { limit: 100 } }),
      opaRequest(baseUrl, '/atendimento', token, { filter: { status: "F" }, options: { limit: 100, populate } })
    ]);

    const getList = (res) => res.ok ? (res.data?.data || (Array.isArray(res.data) ? res.data : [])) : [];

    res.json({
      success: true,
      tickets: [...getList(activeRes), ...getList(historyRes)],
      attendants: getList(uRes),
      debug_info: {
        active_ok: activeRes.ok,
        active_count: getList(activeRes).length,
        history_count: getList(historyRes).length
      }
    });

  } catch (error) { 
    res.status(500).json({ success: false, error: error.message }); 
  }
});

app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
app.listen(port, () => console.log(`Backend rodando na porta ${port}`));
