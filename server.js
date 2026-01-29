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
    res.status(500).json({ success: false, error: 'Erro ao salvar configurações' });
  }
});

// Rota Proxy para contornar CORS e Filtrar Dados
app.get('/api/dashboard-data', async (req, res) => {
  try {
    // 1. Obter credenciais do banco
    const [rows] = await pool.query('SELECT api_url, api_token FROM settings ORDER BY id DESC LIMIT 1');
    // @ts-ignore
    const config = rows[0];

    // Se não tiver configuração
    if (!config || !config.api_url || !config.api_token) {
      return res.status(400).json({ error: 'Configurações de API não encontradas.' });
    }

    const baseUrl = config.api_url.replace(/\/$/, '').trim();
    const headers = { 
      'Authorization': `Bearer ${config.api_token.trim()}`,
      'Content-Type': 'application/json'
    };

    console.log(`[Proxy] Iniciando busca robusta em: ${baseUrl}`);

    // 2. Definir URLs Variadas
    // Algumas versões usam status (texto), outras situacao (int)
    const endpoints = [
      // 1. Tentar por Códigos Numéricos (Mais confiável em versões recentes)
      // 2 = Em Atendimento, 1 = Pendente/Fila
      { url: `${baseUrl}/api/v1/atendimento?situacao=2`, label: 'Situação 2 (Atendimento)' },
      { url: `${baseUrl}/api/v1/atendimento?situacao=1`, label: 'Situação 1 (Fila)' },
      
      // 2. Tentar por Siglas (Versões antigas ou específicas)
      { url: `${baseUrl}/api/v1/atendimento?status=EA`, label: 'Status EA' },
      { url: `${baseUrl}/api/v1/atendimento?status=A`,  label: 'Status A' },
      { url: `${baseUrl}/api/v1/atendimento?status=P`,  label: 'Status P' },
      
      // 3. Atendentes
      { url: `${baseUrl}/api/v1/atendente`, label: 'Atendentes' }
    ];

    // 3. Executar chamadas em paralelo
    const requests = endpoints.map(ep => 
      fetch(ep.url, { headers })
        .then(async r => {
           if (!r.ok) return { label: ep.label, error: r.status, items: [] };
           try {
             const json = await r.json();
             // Tenta encontrar o array de dados em várias propriedades comuns
             const items = Array.isArray(json) ? json : (json.data || json.items || json.payload || []);
             return { label: ep.label, ok: true, items };
           } catch(e) {
             return { label: ep.label, error: 'JSON Parse', items: [] };
           }
        })
        .catch(e => ({ label: ep.label, error: e.message, items: [] }))
    );

    const results = await Promise.all(requests);

    let allTickets = [];
    let attendantsData = [];

    // 4. Processar resultados
    results.forEach(res => {
      if (res.label === 'Atendentes') {
        attendantsData = res.items;
      } else {
        if (res.items.length > 0) {
           console.log(`[Proxy] ${res.label}: ${res.items.length} tickets encontrados.`);
           allTickets = [...allTickets, ...res.items];
        }
      }
    });

    // 5. Fallback Agressivo
    // Se não encontramos NADA com os filtros, buscar os últimos 100 tickets sem filtro
    if (allTickets.length === 0) {
       console.log('[Proxy] Filtros específicos retornaram vazio. Executando Fallback Agressivo (100 recentes)...');
       
       // Tenta variações de ordenação
       const fallbackUrls = [
          `${baseUrl}/api/v1/atendimento?limit=100&sort=-id`, 
          `${baseUrl}/api/v1/atendimento?limit=100&order=desc`
       ];
       
       for (const url of fallbackUrls) {
          if (allTickets.length > 0) break;
          try {
             const fbRes = await fetch(url, { headers });
             if (fbRes.ok) {
                const fbJson = await fbRes.json();
                const fbItems = Array.isArray(fbJson) ? fbJson : (fbJson.data || fbJson.items || []);
                if (fbItems.length > 0) {
                   console.log(`[Proxy] Fallback via ${url} retornou ${fbItems.length} itens.`);
                   allTickets = fbItems;
                }
             }
          } catch (e) {
             console.error('[Proxy] Erro no fallback:', e.message);
          }
       }
    }

    // 6. Deduplicação por ID
    const uniqueTicketsMap = new Map();
    allTickets.forEach(t => {
      const id = t._id || t.id;
      if (id) uniqueTicketsMap.set(String(id), t);
    });

    const uniqueTickets = Array.from(uniqueTicketsMap.values());

    console.log(`[Proxy] Total consolidado enviando para frontend: ${uniqueTickets.length}`);

    // 7. Retornar
    res.json({
      success: true,
      tickets: uniqueTickets,
      attendants: attendantsData,
      debug_info: {
        total_fetched: uniqueTickets.length,
        sources: results.map(r => `${r.label}: ${r.items.length}`).join(', ')
      }
    });

  } catch (error) {
    console.error('[Proxy] Erro Crítico 500:', error);
    res.status(500).json({ 
      error: 'Erro interno no servidor proxy.', 
      details: error.message
    });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});