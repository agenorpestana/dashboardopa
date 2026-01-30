
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
  } catch (error) { console.error(error); }
}
initDB();

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

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

function requestWithBody(urlStr, method, token, bodyData = null) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const lib = url.protocol === 'https:' ? https : http;
      const bodyString = bodyData ? JSON.stringify(bodyData) : '';
      const options = {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json', 
          'Content-Length': Buffer.byteLength(bodyString) 
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
            resolve({ ok: res.statusCode < 300, data: parsed }); 
          }
          catch (e) { resolve({ ok: false, error: 'JSON Parse' }); }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      if (bodyString) req.write(bodyString);
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

app.get('/api/dashboard-data', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    // @ts-ignore
    const config = rows[0];
    if (!config) return res.status(400).json({ error: 'Config missing' });
    const baseUrl = config.api_url.replace(/\/$/, '');
    const token = config.api_token;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Busca simplificada para evitar bugs de filtro na API do Opa
    const [activeRes, historyRes, uRes, dRes] = await Promise.all([
      requestWithBody(`${baseUrl}/api/v1/atendimento`, 'GET', token, {
        "filter": { "status": { "$ne": "F" } },
        "options": { "limit": 1000, "sort": "-_id", "populate": ["id_cliente", "id_atendente", "id_departamento", "setor", "id_contato"] }
      }),
      requestWithBody(`${baseUrl}/api/v1/atendimento`, 'GET', token, {
        "filter": { "status": "F", "data_abertura": { "$gte": startDateStr } },
        "options": { "limit": 2000, "sort": "-_id", "populate": ["id_cliente", "id_atendente", "id_departamento", "setor", "id_contato"] }
      }),
      requestWithBody(`${baseUrl}/api/v1/usuario`, 'GET', token, { "filter": { "status": "A" }, "options": { "limit": 200 } }),
      requestWithBody(`${baseUrl}/api/v1/departamento`, 'GET', token, { "options": { "limit": 100 } })
    ]);

    let activeTickets = activeRes.ok ? (activeRes.data.data || activeRes.data) : [];
    let historyTickets = historyRes.ok ? (historyRes.data.data || historyRes.data) : [];

    if (!Array.isArray(activeTickets)) activeTickets = [];
    if (!Array.isArray(historyTickets)) historyTickets = [];

    res.json({
      success: true,
      tickets: [...activeTickets, ...historyTickets],
      attendants: uRes.ok ? (uRes.data.data || uRes.data) : [],
      departments: dRes.ok ? (dRes.data.data || dRes.data) : []
    });

  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
app.listen(port, () => console.log(`Dashboard rodando na porta ${port}`));
