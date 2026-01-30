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

// Configuração para obter __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// IMPORTANTE: Ignora erros de certificado SSL auto-assinados ou inválidos na API de destino
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

// Configuração do Banco de Dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'opadashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Pool de conexão
const pool = mysql.createPool(dbConfig);

// Inicialização do Banco de Dados
async function initDB() {
  try {
    const connection = await pool.getConnection();
    console.log('Conectado ao MySQL com sucesso.');

    // Criar tabela de usuários
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de configurações
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        api_url VARCHAR(255),
        api_token TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Verificar se existe usuário padrão
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', ['suporte']);
    
    // @ts-ignore
    if (rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('200616', salt);
      await connection.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['suporte', hash]);
      console.log('Usuário padrão "suporte" criado com sucesso.');
    }

    connection.release();
  } catch (error) {
    console.error('Erro fatal ao conectar no banco de dados. Verifique as credenciais no .env');
    console.error(error);
  }
}

// Inicializa o DB ao arrancar
initDB();

// --- Rotas da API ---

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    // @ts-ignore
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Senha incorreta' });
    }

    res.json({ success: true, username: user.username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Erro interno no login' });
  }
});

// Obter Configurações
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    // @ts-ignore
    const config = rows[0] || {};
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Salvar Configurações
app.post('/api/settings', async (req, res) => {
  const { username, password, api_url, api_token } = req.body;

  try {
    const [userRows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    // @ts-ignore
    const user = userRows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(403).json({ success: false, error: 'Credenciais inválidas.' });
    }

    const [settingRows] = await pool.query('SELECT id FROM settings LIMIT 1');
    // @ts-ignore
    if (settingRows.length > 0) {
      await pool.query('UPDATE settings SET api_url = ?, api_token = ? WHERE id = ?', [api_url, api_token, settingRows[0].id]);
    } else {
      await pool.query('INSERT INTO settings (api_url, api_token) VALUES (?, ?)', [api_url, api_token]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Erro ao salvar configurações' });
  }
});

// Normalizador de URL
const normalizeUrl = (url) => {
  if (!url) return '';
  let clean = url.trim().replace(/\/$/, '');
  clean = clean.replace(/\/api\/v1$/, '');
  clean = clean.replace(/\/api$/, '');
  return clean;
};

// Helper: Request with Body for GET (Opa Suite Requirement)
function requestWithBody(urlStr, method, token, bodyData = null) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const lib = url.protocol === 'https:' ? https : http;
      
      const bodyString = bodyData ? JSON.stringify(bodyData) : '';

      const options = {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
          let parsedData = null;
          let error = null;
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
             try {
                parsedData = JSON.parse(data);
             } catch (e) {
                error = 'JSON Parse Error';
             }
          } else {
             error = `HTTP ${res.statusCode}: ${data.substring(0, 100)}`;
          }

          resolve({ 
            ok: !error, 
            status: res.statusCode, 
            data: parsedData,
            error: error 
          });
        });
      });

      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      
      if (bodyString) {
        req.write(bodyString);
      }
      req.end();

    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

// Helpers de Data
const getPastDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Rota Proxy Principal
app.get('/api/dashboard-data', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    // @ts-ignore
    const config = rows[0];

    if (!config || !config.api_url || !config.api_token) {
      return res.status(400).json({ error: 'Configurações de API não encontradas.' });
    }

    const baseUrl = normalizeUrl(config.api_url);
    const token = config.api_token.trim();

    // Data de início: 30 dias atrás para estatísticas mensais e ranking
    const startDate = getPastDate(30);

    console.log(`[Proxy] Buscando dados em: ${baseUrl}/api/v1/atendimento`);

    // TENTATIVA 1: Filtro Otimizado (Removido o $ne "F" para trazer finalizados dos últimos 30 dias)
    const payloadOptimized = {
       "filter": {
          "dataInicialAbertura": startDate
       },
       "options": { 
          "limit": 1000,
          "sort": "-_id",
          "populate": ["id_cliente", "id_atendente", "setor"]
       }
    };
    
    // Busca de Usuários (Atendentes)
    const attendantsPayload = {
        "filter": { "status": "A", "tipo": "user" },
        "options": { "limit": 100 }
    };
    
    // Busca de Clientes (Base de Cadastro)
    const clientsPayload = {
        "options": { "limit": 500, "sort": "-_id" }
    };
    
    // Busca de Contatos (Base de Agenda)
    const contactsPayload = {
        "options": { "limit": 500, "sort": "-_id" }
    };

    // Busca de Departamentos (Setores)
    const departmentsPayload = {
        "options": { "limit": 100, "sort": "nome" }
    };

    // Executa Promises
    const attendantsPromise = requestWithBody(`${baseUrl}/api/v1/usuario`, 'GET', token, attendantsPayload);
    const clientsPromise = requestWithBody(`${baseUrl}/api/v1/cliente`, 'GET', token, clientsPayload);
    const contactsPromise = requestWithBody(`${baseUrl}/api/v1/contato`, 'GET', token, contactsPayload);
    const departmentsPromise = requestWithBody(`${baseUrl}/api/v1/departamento`, 'GET', token, departmentsPayload);
    
    // Busca de Tickets
    let ticketsRes = await requestWithBody(`${baseUrl}/api/v1/atendimento`, 'GET', token, payloadOptimized);

    let tickets = [];
    let attendants = [];
    let clients = [];
    let contacts = [];
    let departments = [];
    let debugMsg = "";

    // Lógica de Fallback para Tickets
    if (!ticketsRes.ok) {
        debugMsg += "Optimized failed. Trying simple GET. ";
        ticketsRes = await requestWithBody(`${baseUrl}/api/v1/atendimento?limit=500&sort=-_id&populate=id_cliente`, 'GET', token, null);
    }

    // Processar resposta de Tickets
    if (ticketsRes.ok && ticketsRes.data) {
      if (Array.isArray(ticketsRes.data.data)) {
        tickets = ticketsRes.data.data;
      } else if (Array.isArray(ticketsRes.data)) {
        tickets = ticketsRes.data;
      }
      console.log(`[Proxy] Tickets obtidos: ${tickets.length}`);
    }

    // Processar resposta de Atendentes
    const attendantsRes = await attendantsPromise;
    if (attendantsRes.ok && attendantsRes.data) {
      if (Array.isArray(attendantsRes.data.data)) {
        attendants = attendantsRes.data.data;
      } else if (Array.isArray(attendantsRes.data)) {
        attendants = attendantsRes.data;
      }
    }

    // Processar resposta de Clientes
    const clientsRes = await clientsPromise;
    if (clientsRes.ok && clientsRes.data) {
      if (Array.isArray(clientsRes.data.data)) {
        clients = clientsRes.data.data;
      } else if (Array.isArray(clientsRes.data)) {
        clients = clientsRes.data;
      }
    }
    
    // Processar resposta de Contatos
    const contactsRes = await contactsPromise;
    if (contactsRes.ok && contactsRes.data) {
      if (Array.isArray(contactsRes.data.data)) {
        contacts = contactsRes.data.data;
      } else if (Array.isArray(contactsRes.data)) {
        contacts = contactsRes.data;
      }
    }

    // Processar resposta de Departamentos
    const departmentsRes = await departmentsPromise;
    if (departmentsRes.ok && departmentsRes.data) {
      if (Array.isArray(departmentsRes.data.data)) {
        departments = departmentsRes.data.data;
      } else if (Array.isArray(departmentsRes.data)) {
        departments = departmentsRes.data;
      }
    }

    // Retornar para o frontend
    res.json({
      success: true,
      tickets: tickets,
      attendants: attendants,
      clients: clients, 
      contacts: contacts,
      departments: departments,
      debug_info: {
        msg: debugMsg,
        tickets_raw_count: tickets.length
      }
    });

  } catch (error) {
    console.error('[Proxy] Erro Crítico:', error);
    res.status(500).json({ error: error.message });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});