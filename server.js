import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    const headers = { 
      'Authorization': `Bearer ${config.api_token.trim()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'OpaDashboard/1.0' // Alguns firewalls bloqueiam fetch sem User-Agent
    };

    console.log(`[Proxy] Buscando dados em: ${baseUrl}/api/v1/atendimento`);

    // Busca Paralela: Atendimentos e Atendentes
    const [ticketsRes, attendantsRes] = await Promise.all([
      // 1. Tickets: Usamos limite alto via URL query (tentativa de compatibilidade)
      // Se a API ignorar o query string, ela retornará os default (recentes), o que é OK.
      fetch(`${baseUrl}/api/v1/atendimento?limit=100`, { headers }).then(r => r.json().catch(() => ({ error: 'Parse Error' }))),
      
      // 2. Atendentes
      fetch(`${baseUrl}/api/v1/atendente`, { headers }).then(r => r.json().catch(() => ({ error: 'Parse Error' })))
    ]);

    let tickets = [];
    let attendants = [];
    let debugMsg = "";

    // Processar Tickets
    if (ticketsRes && ticketsRes.data && Array.isArray(ticketsRes.data)) {
      tickets = ticketsRes.data;
      console.log(`[Proxy] Tickets encontrados: ${tickets.length}`);
    } else if (Array.isArray(ticketsRes)) {
      tickets = ticketsRes; // Algumas versões retornam array direto
    } else {
      debugMsg += `Tickets Error: ${JSON.stringify(ticketsRes)} `;
      console.warn('[Proxy] Resposta inesperada tickets:', ticketsRes);
    }

    // Processar Atendentes
    if (attendantsRes && attendantsRes.data && Array.isArray(attendantsRes.data)) {
      attendants = attendantsRes.data;
    } else if (Array.isArray(attendantsRes)) {
      attendants = attendantsRes;
    }

    // Retornar para o frontend
    res.json({
      success: true,
      tickets: tickets,
      attendants: attendants,
      debug_info: {
        msg: debugMsg,
        tickets_raw_count: tickets.length
      }
    });

  } catch (error) {
    console.error('[Proxy] Erro:', error);
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
