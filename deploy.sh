#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Instalador Opa Suite Dashboard (Full Stack) ===${NC}"

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Por favor, execute como root (sudo ./deploy.sh)${NC}"
  exit
fi

# ==========================================
# 1. Coleta de Dados
# ==========================================
echo -e "${YELLOW}Digite o domínio ou subdomínio (ex: dash.meudominio.com):${NC}"
read DOMAIN

echo -e "${YELLOW}Digite a URL do repositório GitHub (ex: https://github.com/seu-usuario/seu-repo.git):${NC}"
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

if [ -z "$DOMAIN" ] || [ -z "$REPO_URL" ] || [ -z "$DB_PASSWORD" ]; then
  echo -e "${RED}Domínio, Repositório e Senha do Banco são obrigatórios.${NC}"
  exit 1
fi

# ==========================================
# 2. Atualização e Instalação de Pacotes
# ==========================================
echo -e "${GREEN}Atualizando sistema e instalando dependências...${NC}"
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx curl git mysql-server build-essential

# Instalar Node.js 20
echo -e "${GREEN}Instalando Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar PM2 globalmente
npm install -g pm2

# ==========================================
# 3. Configuração do MySQL
# ==========================================
echo -e "${GREEN}Configurando MySQL...${NC}"

# Criação do Banco e Usuário
mysql -u root -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
mysql -u root -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -u root -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
mysql -u root -e "FLUSH PRIVILEGES;"

echo -e "${GREEN}Banco de dados configurado.${NC}"

# ==========================================
# 4. Clonagem e Configuração do Projeto
# ==========================================
APP_DIR="/var/www/$DOMAIN"

echo -e "${GREEN}Preparando diretório $APP_DIR...${NC}"
mkdir -p $APP_DIR
rm -rf $APP_DIR/* # Limpa instalação anterior se existir

# Clonar Repositório
echo -e "${YELLOW}Clonando repositório...${NC}"
git clone $REPO_URL $APP_DIR

cd $APP_DIR

# Criar arquivo .env
echo -e "${YELLOW}Criando arquivo de configuração (.env)...${NC}"
cat > .env <<EOL
PORT=3000
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
EOL

# ==========================================
# 5. Build e Instalação
# ==========================================
echo -e "${GREEN}Instalando dependências e compilando...${NC}"

# Instalar dependências (Backend + Frontend)
npm install

# Build do Frontend (Vite)
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Erro: Falha no build. A pasta 'dist' não foi criada.${NC}"
    exit 1
fi

# ==========================================
# 6. Inicialização do Backend (PM2)
# ==========================================
echo -e "${GREEN}Iniciando Backend com PM2...${NC}"
pm2 stop opa-dash-api 2>/dev/null
pm2 delete opa-dash-api 2>/dev/null
pm2 start server.cjs --name "opa-dash-api"
pm2 save
pm2 startup | tail -n 1 | bash # Configura startup automático

# ==========================================
# 7. Configuração do Nginx (Reverse Proxy)
# ==========================================
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
echo -e "${GREEN}Configurando Nginx...${NC}"

cat > $NGINX_CONF <<EOL
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend estático (React Build)
    root $APP_DIR/dist;
    index index.html;

    # Rota para API (Proxy para Node.js)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Rota padrão (SPA - Redireciona tudo para index.html exceto API)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache estático para assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    error_log /var/log/nginx/${DOMAIN}_error.log;
    access_log /var/log/nginx/${DOMAIN}_access.log;
}
EOL

# Ativar site
ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar e reiniciar Nginx
nginx -t
if [ $? -eq 0 ]; then
    systemctl restart nginx
else
    echo -e "${RED}Erro na configuração do Nginx.${NC}"
    exit 1
fi

# ==========================================
# 8. SSL (Certbot)
# ==========================================
echo -e "${YELLOW}Solicitando certificado SSL (Let's Encrypt)...${NC}"
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN --redirect

# ==========================================
# 9. Finalização
# ==========================================
echo -e "${GREEN}=== Instalação Concluída com Sucesso! ===${NC}"
echo -e "Acesse seu dashboard em: https://$DOMAIN"
echo -e "Usuário Padrão (Suporte): suporte"
echo -e "Senha Padrão: 200616"
echo -e "Banco de dados: $DB_NAME configurado."
