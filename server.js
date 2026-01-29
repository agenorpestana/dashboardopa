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
    console.error('Erro ao inicializar banco de dados:', error);
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
    res.status(500).json({ success: false, error: 'Erro interno' });
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

// Salvar Configurações (Requer senha para segurança extra)
app.post('/api/settings', async (req, res) => {
  const { username, password, api_url, api_token } = req.body;

  try {
    // 1. Revalidar credenciais antes de permitir alteração
    const [userRows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    // @ts-ignore
    const user = userRows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(403).json({ success: false, error: 'Credenciais inválidas para salvar alterações.' });
    }

    // 2. Salvar ou Atualizar
    // Verifica se já existe config
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
    res.status(500).json({ success: false, error: 'Erro ao salvar' });
  }
});

// Rota Proxy para contornar CORS
// O servidor faz a requisição para a API externa e retorna o resultado para o frontend
app.get('/api/dashboard-data', async (req, res) => {
  try {
    // 1. Obter credenciais do banco
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    // @ts-ignore
    const config = rows[0];

    if (!config || !config.api_url || !config.api_token) {
      return res.status(400).json({ error: 'Configurações de API não encontradas.' });
    }

    const baseUrl = config.api_url.replace(/\/$/, '').trim();
    const headers = { 
      'Authorization': `Bearer ${config.api_token.trim()}`,
      'Content-Type': 'application/json'
    };

    console.log(`[Proxy] Buscando dados em: ${baseUrl}`);

    // 2. Buscar dados no servidor externo (Node.js não tem CORS)
    // Usamos Promise.allSettled para não falhar tudo se apenas um endpoint falhar
    const [ticketsRes, attendantsRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/v1/atendimento`, { headers }), 
      fetch(`${baseUrl}/api/v1/atendente`, { headers })
    ]);

    let ticketsData = [];
    let attendantsData = [];

    // Processar Atendimentos
    if (ticketsRes.status === 'fulfilled') {
       if (ticketsRes.value.ok) {
         const json = await ticketsRes.value.json();
         // Opa pode retornar array direto ou { data: [] }
         ticketsData = Array.isArray(json) ? json : (json.data || json.items || []);
       } else {
         console.warn(`[Proxy] Erro API Tickets: ${ticketsRes.value.status}`);
       }
    } else {
      console.error('[Proxy] Falha na requisição de tickets:', ticketsRes.reason);
    }

    // Processar Atendentes
    if (attendantsRes.status === 'fulfilled') {
       if (attendantsRes.value.ok) {
         const json = await attendantsRes.value.json();
         attendantsData = Array.isArray(json) ? json : (json.data || []);
       } else {
         console.warn(`[Proxy] Erro API Atendentes: ${attendantsRes.value.status}`);
       }
    }

    // 3. Retornar dados combinados para o frontend
    res.json({
      success: true,
      tickets: ticketsData,
      attendants: attendantsData
    });

  } catch (error) {
    console.error('[Proxy] Erro geral:', error);
    res.status(500).json({ error: 'Erro interno no servidor proxy.' });
  }
});

// SPA Fallback - Para qualquer rota não-API, serve o index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});