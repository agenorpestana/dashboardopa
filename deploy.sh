#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Instalador/Atualizador Opa Suite Dashboard v2 ===${NC}"

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Por favor, execute como root (sudo ./deploy.sh)${NC}"
  exit
fi

# ==========================================
# 1. Coleta de Dados Básicos
# ==========================================
echo -e "${YELLOW}Digite o domínio ou subdomínio (ex: dash.meudominio.com):${NC}"
read DOMAIN

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}Domínio é obrigatório.${NC}"
  exit 1
fi

APP_DIR="/var/www/$DOMAIN"
IS_UPDATE=0

# Verifica se é uma atualização ou instalação nova
if [ -d "$APP_DIR/.git" ]; then
    echo -e "${GREEN}Instalação existente detectada em $APP_DIR.${NC}"
    echo -e "${GREEN}Modo de ATUALIZAÇÃO ativado.${NC}"
    IS_UPDATE=1
else
    echo -e "${GREEN}Nenhuma instalação encontrada em $APP_DIR.${NC}"
    echo -e "${GREEN}Modo de NOVA INSTALAÇÃO ativado.${NC}"
fi

# ==========================================
# 2. Dados de Conexão (Só pede se necessário)
# ==========================================

# Se for nova instalação OU se o arquivo .env não existir
if [ $IS_UPDATE -eq 0 ] || [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${YELLOW}Digite a URL do repositório GitHub:${NC}"
    read REPO_URL

    echo -e "${YELLOW}Configuração do Banco de Dados MySQL:${NC}"
    echo -e "Nome do Banco de Dados [opadashboard]:"
    read DB_NAME
    DB_NAME=${DB_NAME:-opadashboard}

    echo -e "Usuário do Banco [opadash]:"
    read DB_USER
    DB_USER=${DB_USER:-opadash}

    echo -e "Senha do Banco:"
    read -s DB_PASSWORD
    echo
fi

# ==========================================
# 3. Pacotes do Sistema
# ==========================================
echo -e "${GREEN}Verificando pacotes do sistema...${NC}"
apt update
apt install -y nginx certbot python3-certbot-nginx curl git mysql-server build-essential

# Node.js check (Versão 20 LTS)
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# PM2 check
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# ==========================================
# 4. Configuração do MySQL (Garante usuário/banco)
# ==========================================
# Só executa setup de banco se tivermos a senha disponível (Nova instalação ou inserida manualmente)
if [ ! -z "$DB_PASSWORD" ]; then
    echo -e "${GREEN}Configurando MySQL...${NC}"
    mysql -u root -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
    mysql -u root -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
    mysql -u root -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
    mysql -u root -e "FLUSH PRIVILEGES;"
fi

# ==========================================
# 5. Gerenciamento do Código Fonte
# ==========================================
mkdir -p $APP_DIR

if [ $IS_UPDATE -eq 1 ]; then
    # ATUALIZAÇÃO
    echo -e "${YELLOW}Atualizando código fonte (git pull)...${NC}"
    cd $APP_DIR
    git reset --hard
    git pull
else
    # INSTALAÇÃO NOVA
    if [ "$(ls -A $APP_DIR)" ]; then
       echo -e "${RED}O diretório $APP_DIR não está vazio. Limpando...${NC}"
       rm -rf $APP_DIR/*
       rm -rf $APP_DIR/.* 2>/dev/null
    fi
    
    echo -e "${YELLOW}Clonando repositório...${NC}"
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
    
    # Criar .env apenas na instalação nova
    echo -e "${YELLOW}Criando arquivo .env...${NC}"
    cat > .env <<EOL
PORT=3000
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
EOL
fi

# ==========================================
# 6. Build
# ==========================================
echo -e "${GREEN}Instalando dependências e compilando...${NC}"
npm install
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Erro: Falha no build. A pasta 'dist' não foi criada.${NC}"
    exit 1
fi

# ==========================================
# 7. Gerenciamento de Processos (PM2)
# ==========================================
echo -e "${GREEN}Reiniciando Backend...${NC}"
# Para e remove processo antigo para garantir atualização das variáveis e código
pm2 delete opa-dash-api 2>/dev/null
pm2 start server.cjs --name "opa-dash-api"
pm2 save

# ==========================================
# 8. Nginx e SSL
# ==========================================
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

if [ ! -f "$NGINX_CONF" ]; then
    echo -e "${GREEN}Configurando Nginx...${NC}"
    cat > $NGINX_CONF <<EOL
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/dist;
    index index.html;

    # Proxy para API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # SPA Frontend
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
EOL

    ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Testa configuração
    nginx -t
    systemctl restart nginx

    echo -e "${YELLOW}Configurando SSL (Let's Encrypt)...${NC}"
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN --redirect
else
    echo -e "${GREEN}Configuração Nginx já existente. Reiniciando serviço...${NC}"
    systemctl restart nginx
fi

echo -e "${GREEN}=== Processo Concluído! ===${NC}"
echo -e "1. Acesse: https://$DOMAIN"
if [ $IS_UPDATE -eq 0 ]; then
    echo -e "2. Vá em Configurações > Login"
    echo -e "3. Usuário: suporte | Senha: 200616"
fi
