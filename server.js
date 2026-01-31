
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

// Função de requisição otimizada para o padrão de filtros do Opa Suite
function opaRequest(baseUrl, path, token, params = {}) {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${baseUrl}${path}`);
      
      // O Opa Suite espera um único objeto "filter" contendo everything
      const loopbackFilter = {
        where: params.filter || {},
        limit: params.options?.limit || 1000,
        skip: params.options?.skip || 0,
        // Converte "-_id" para "_id DESC" ou usa o padrão
        order: params.options?.sort ? 
          (params.options.sort.startsWith('-') ? `${params.options.sort.substring(1)} DESC` : `${params.options.sort} ASC`) : 
          "_id DESC",
        populate: params.options?.populate || []
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
            // Se houver erro na resposta da API
            if (res.statusCode >= 400) {
                console.error(`[OpaAPI Error ${res.statusCode}]`, parsed);
                resolve({ ok: false, error: parsed });
            } else {
                resolve({ ok: true, data: parsed }); 
            }
          }
          catch (e) { resolve({ ok: false, error: 'JSON Parse Error' }); }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
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
    if (!config) return res.status(400).json({ error: 'Config missing' });
    
    const baseUrl = config.api_url.replace(/\/$/, '');
    const token = config.api_token;

    const populate = ["id_cliente", "id_atendente", "id_motivo_atendimento", "setor", "id_contato"];
    const robotId = '5d1642ad4b16a50312cc8f4d';

    // Buscamos em paralelo usando a nova estrutura de filtro unificado
    const [activeRes, h1, h2, h3, uRes, clientRes, contactRes] = await Promise.all([
      opaRequest(baseUrl, '/api/v1/atendimento', token, {
        filter: { status: { "$ne": "F" }, id_atendente: { "$ne": robotId } },
        options: { limit: 1000, populate: populate, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/api/v1/atendimento', token, {
        filter: { status: "F", id_atendente: { "$ne": robotId } },
        options: { limit: 1000, populate: populate, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/api/v1/atendimento', token, {
        filter: { status: "F", id_atendente: { "$ne": robotId } },
        options: { limit: 1000, skip: 1000, populate: populate, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/api/v1/atendimento', token, {
        filter: { status: "F", id_atendente: { "$ne": robotId } },
        options: { limit: 1000, skip: 2000, populate: populate, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/api/v1/usuario', token, {
        filter: { status: "A" },
        options: { limit: 200 }
      }),
      opaRequest(baseUrl, '/api/v1/cliente', token, {
        options: { limit: 1000, sort: "-_id" }
      }),
      opaRequest(baseUrl, '/api/v1/contato', token, {
        options: { limit: 1000, sort: "-_id" }
      })
    ]);

    const getList = (res) => {
      if (!res.ok) return [];
      // No Opa Suite v1, os dados vem em res.data.data ou direto no res.data
      const data = res.data;
      if (data && data.data) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    };

    const activeList = getList(activeRes);
    const historyList = [...getList(h1), ...getList(h2), ...getList(h3)];

    res.json({
      success: true,
      tickets: [...activeList, ...historyList],
      attendants: getList(uRes),
      clients: getList(clientRes),
      contacts: getList(contactRes)
    });

  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
app.listen(port, () => console.log(`Backend rodando na porta ${port}`));
