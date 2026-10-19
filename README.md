# BarberFlow 💈⚡

Plataforma SaaS multi-tenant moderna e 100% automatizada para gestão de barbearias e salões de beleza, com agendamentos em tempo real via WhatsApp, controle de fluxo de caixa e painel Super Admin para gestão global da plataforma.

---

## 📑 Sumário

- [Visão Geral & Recursos](#-visão-geral--recursos)
- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Guia 1: Deploy no Easypanel (Recomendado)](#-guia-1-deploy-no-easypanel-passo-a-passo)
- [Guia 2: Instalação no Linux / VPS com Docker Compose](#-guia-2-instalação-no-linux--vps-com-docker-compose)
- [Guia 3: Instalação Direta no Linux (Bare-Metal com PM2)](#-guia-3-instalação-direta-no-linux-sem-docker---pm2)
- [Como Funciona o Bot de WhatsApp](#-como-funciona-o-bot-de-whatsapp)
- [Primeiro Acesso & Super Admin](#-primeiro-acesso--super-admin)
- [Comandos Úteis & Manutenção](#-comandos-úteis--manutenção)

---

## 🌟 Visão Geral & Recursos

- **Isolamento Multi-Tenant Completo:** Cada barbearia possui seus próprios clientes, serviços, barbeiros, relatórios e sessão de WhatsApp isolados logicamente por `tenantId` no PostgreSQL.
- **Onboarding Self-Service com Trial:** Donos de salão cadastram-se sozinhos e recebem 14 dias de teste grátis com setup inicial guiado (logo, horários de expediente e serviços).
- **Atendimento 100% Automatizado via WhatsApp:** Conexão simples por QR Code. O cliente final consulta horários livres, escolhe o barbeiro, confirma o agendamento e recebe lembretes antes do corte.
- **Calendário Visual & Baixa Automática no Caixa:** Gestão de horários por profissional. Ao concluir um atendimento, o valor é automaticamente computado como receita no fluxo de caixa.
- **Painel Super Admin:** Visão macro da plataforma (MRR, total de salões, salões ativos/bloqueados por inadimplência, auditoria de logs e status da API de cada salão).

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologias |
| :--- | :--- |
| **Backend** | Node.js 22 (ESM), Express 5, Prisma ORM 6, Zod, JWT com cookies `httpOnly`, Pino Logger |
| **Banco de Dados** | PostgreSQL 16 (índices compostos por tenant, chaves de sessão do Baileys e constraints de agendamento) |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Lucide Icons, CSS Design System (Dark Luxury + Glassmorphism) |
| **WhatsApp Engine** | Baileys integrado com persistência de chaves de autenticação no PostgreSQL (stateless) |
| **Containers** | Docker multi-stage otimizado com execução automática de migrations (`prisma migrate deploy`) |

---

## 📁 Estrutura do Projeto

```text
BarberFlow/
├── apps/
│   ├── server/                     # Backend API & WhatsApp Engine (Node.js 22 + Prisma 6)
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Modelos de dados multi-tenant
│   │   ├── src/                    # Código fonte da API e motor do bot
│   │   ├── Dockerfile              # Build multi-stage da API
│   │   └── package.json
│   │
│   └── web/                        # Frontend Next.js 15 (App Router)
│       ├── src/                    # Telas públicas, onboarding, painel do salão e super admin
│       ├── Dockerfile              # Build standalone Next.js
│       └── package.json
│
├── .env.example                    # Template de variáveis de ambiente
├── .gitignore                      # Regras de exclusão do Git
├── docker-compose.yml              # Compose de produção (otimizado para Easypanel / VPS)
└── docker-compose.dev.yml          # Override com mapeamento de portas locais
```

---

## 🔑 Variáveis de Ambiente

Copie o template `.env.example` para `.env` e preencha os valores:

```bash
cp .env.example .env
```

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `POSTGRES_USER` | Usuário do banco de dados | `barberflow` |
| `POSTGRES_PASSWORD` | Senha forte do banco | `Gere_Uma_Senha_Forte_Aqui` |
| `POSTGRES_DB` | Nome do banco de dados | `barberflow` |
| `JWT_SECRET` | Segredo para assinar tokens JWT (mínimo 32 caracteres) | Gere via comando abaixo |
| `JWT_EXPIRES_IN` | Tempo de expiração da sessão | `7d` |
| `COOKIE_SECURE` | Marque `true` se estiver usando HTTPS / SSL no domínio | `true` |
| `TRIAL_DAYS` | Dias de teste gratuito para novas contas | `14` |
| `SUPER_ADMIN_NAME` | Nome do administrador global da plataforma | `Super Admin` |
| `SUPER_ADMIN_EMAIL` | E-mail para primeiro login no painel Master | `admin@seudominio.com` |
| `SUPER_ADMIN_PASSWORD` | Senha de acesso do Super Admin | `SenhaForte123@` |

> 💡 **Como gerar um JWT Secret seguro rapidamente:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

---

## 🚀 Guia 1: Deploy no Easypanel (Passo a Passo)

O Easypanel gerencia containers Docker com interface gráfica amigável e emite certificados SSL automaticamente.

### Passo 1: Criar o Projeto
1. Acesse o seu painel do Easypanel.
2. Clique em **New Project** e defina o nome (ex: `barberflow`).

### Passo 2: Criar o Serviço via Compose
1. Dentro do projeto criado, clique em **+ Service**.
2. Escolha o tipo **Compose**.
3. Selecione a aba **Git** e conecte seu repositório:
   - **Repository:** `https://github.com/GuilhermeAzespo/BarberFlow`
   - **Branch:** `main`
   - **Compose Path:** `docker-compose.yml`

### Passo 3: Configurar as Variáveis de Ambiente
Na aba **Environment** do serviço Compose no Easypanel, adicione as seguintes variáveis:

```env
POSTGRES_USER=barberflow
POSTGRES_PASSWORD=Defina_Uma_Senha_Segura_Para_O_Banco
POSTGRES_DB=barberflow

JWT_SECRET=Cole_Aqui_O_Segredo_Com_Mais_De_32_Caracteres
JWT_EXPIRES_IN=7d
COOKIE_SECURE=true
LOG_LEVEL=info
TRIAL_DAYS=14
WHATSAPP_ENABLED=true

SUPER_ADMIN_NAME=Administrador Master
SUPER_ADMIN_EMAIL=admin@seudominio.com
SUPER_ADMIN_PASSWORD=SuaSenhaDeAcessoAoSuperAdmin
```

### Passo 4: Configurar o Domínio Público
> ⚠️ **IMPORTANTE:** No Easypanel, aponte o seu domínio **APENAS para o serviço `web`** (porta `3000`).
>
> **Por que?** O Next.js (`web`) já possui um proxy reverso interno configurado em `/api/*` que redireciona todas as chamadas de backend para o container `server:4000` via rede interna do Docker. Dessa forma:
> - Você só precisa de **1 domínio** (ex: `app.seudominio.com`).
> - Evita qualquer bloqueio ou erro de CORS.
> - Os cookies de autenticação trafegam com segurança no mesmo domínio.

1. No serviço `web` dentro do Compose, acesse a aba **Domains**.
2. Adicione seu domínio (ex: `app.seudominio.com`).
3. Defina a porta como `3000`.
4. O Easypanel emitirá automaticamente o certificado SSL (HTTPS) via Let's Encrypt.

### Passo 5: Deploy
1. Clique em **Deploy**.
2. O Easypanel fará o build das imagens Docker, subirá o PostgreSQL, executará automaticamente as migrations com `npx prisma migrate deploy`, criará os planos e o usuário Super Admin, e colocará o site no ar.

---

## 🐧 Guia 2: Instalação no Linux / VPS com Docker Compose

Recomendado para servidores VPS rodando **Ubuntu 22.04 / 24.04 LTS** ou **Debian 12**.

### Requisitos Mínimos do Servidor
- **CPU:** 2 vCPU
- **Memória RAM:** 2 GB ou superior
- **Disco:** 20 GB SSD
- **Portas Abertas:** 80 (HTTP), 443 (HTTPS) e 22 (SSH)

---

### Passo 1: Atualizar o Sistema e Instalar o Docker
Conecte-se na sua VPS via SSH e execute:

```bash
# 1. Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# 2. Instalar dependências básicas
sudo apt install -y curl git ufw

# 3. Instalar Docker oficial
curl -fsSL https://get.docker.com | sh

# 4. Habilitar o Docker para iniciar junto ao sistema
sudo systemctl enable --now docker

# 5. Adicionar seu usuário ao grupo docker (opcional)
sudo usermod -aG docker $USER
```

---

### Passo 2: Clonar o Repositório do BarberFlow
```bash
# Clone o projeto
git clone https://github.com/GuilhermeAzespo/BarberFlow.git /var/www/barberflow

# Acesse o diretório
cd /var/www/barberflow
```

---

### Passo 3: Configurar as Variáveis de Ambiente
```bash
# Crie o arquivo .env
cp .env.example .env

# Edite o arquivo com o editor de sua preferência
nano .env
```
Preencha suas senhas seguras, segredo JWT e o e-mail do Super Admin. Salve com `Ctrl + O` e saia com `Ctrl + X`.

---

### Passo 4: Subir a Stack em Produção
Para rodar em conjunto com um proxy reverso (Nginx/Caddy) na VPS, mapeamos a porta do frontend na máquina:

Crie o arquivo `docker-compose.override.yml`:
```yaml
services:
  web:
    ports:
      - "127.0.0.1:3000:3000"
```

Inicie os containers em segundo plano:
```bash
docker compose up -d --build
```

Verifique se todos os containers estão saudáveis:
```bash
docker compose ps
```

---

### Passo 5: Configurar Nginx + SSL Grátis (Certbot)

Instale o Nginx e o Certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crie a configuração do seu domínio no Nginx:
```bash
sudo nano /etc/nginx/sites-available/barberflow
```

Cole o conteúdo abaixo (substitua `app.seudominio.com` pelo seu domínio real):
```nginx
server {
    listen 80;
    server_name app.seudominio.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ative o site e reinicie o Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/barberflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Gere o certificado SSL gratuito com Let's Encrypt:
```bash
sudo certbot --nginx -d app.seudominio.com
```
O Certbot configurará o HTTPS automaticamente. Pronto! Acesse `https://app.seudominio.com`.

---

## 🖥️ Guia 3: Instalação Direta no Linux (Sem Docker - PM2)

Caso prefira rodar a aplicação diretamente no sistema operacional (bare-metal) utilizando Node.js e PostgreSQL locais:

### Passo 1: Instalar Node.js 22 e PostgreSQL 16
```bash
# 1. Instalar Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# 2. Instalar PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# 3. Instalar PM2 globalmente
sudo npm install -g pm2
```

### Passo 2: Configurar o Banco de Dados no PostgreSQL
```bash
sudo -u postgres psql
```
No terminal do PostgreSQL, execute:
```sql
CREATE USER barberflow WITH PASSWORD 'senha_forte_do_banco';
CREATE DATABASE barberflow OWNER barberflow;
GRANT ALL PRIVILEGES ON DATABASE barberflow TO barberflow;
\q
```

### Passo 3: Clonar e Instalar o Backend
```bash
cd /var/www/barberflow/apps/server
cp .env.example .env
nano .env
```
Ajuste a `DATABASE_URL` no `.env` do servidor:
```env
DATABASE_URL="postgresql://barberflow:senha_forte_do_banco@localhost:5432/barberflow?schema=public"
PORT=4000
JWT_SECRET="seu-segredo-jwt-com-mais-de-32-caracteres"
COOKIE_SECURE=true
```

Instale as dependências, gere o Prisma e compile:
```bash
npm install
npx prisma migrate deploy
npm run build
```

Inicie o backend com o PM2:
```bash
pm2 start dist/index.js --name "barberflow-server"
```

### Passo 4: Instalar e Compilar o Frontend
```bash
cd /var/www/barberflow/apps/web
npm install
npm run build
```

Inicie o frontend com o PM2:
```bash
pm2 start npm --name "barberflow-web" -- start -- -p 3000
pm2 save
pm2 startup
```

Configure o Nginx apontando para a porta 3000 conforme o [Passo 5 do Guia 2](#passo-5-configurar-nginx--ssl-grátis-certbot).

---

## 📱 Como Funciona o Bot de WhatsApp

1. Faça login no painel do seu salão e navegue até **Bot WhatsApp**.
2. Clique no botão **Gerar QR Code para Conectar**.
3. Abra o aplicativo do WhatsApp no celular:
   - Toque em **Configurações / Opções** > **Aparelhos Conectados** > **Conectar um aparelho**.
   - Aponte a câmera para o QR Code exibido na tela.
4. O status mudará imediatamente para **Conectado** com o número pareado.
5. **Comportamento do Bot:**
   - O cliente final envia uma mensagem (ex: *"Oi"* ou *"Menu"*).
   - O bot responde com a saudação personalizada e opções numeradas.
   - O cliente escolhe o serviço, o barbeiro desejado e visualiza apenas os horários livres calculados pelo sistema.
   - Ao confirmar, o agendamento é salvo no banco e exibido em tempo real no **Calendário do Salão**.
   - O bot envia lembretes automáticos com antecedência configurável (padrão: 2 horas antes).

---

## 👑 Primeiro Acesso & Super Admin

O sistema cria automaticamente no primeiro boot o usuário administrador global configurado em `SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_PASSWORD`.

- **URL de Login:** `https://app.seudominio.com/login`
- **Credenciais Iniciais:** As definidas nas variáveis de ambiente.
- Ao logar com a conta Super Admin, você terá acesso ao menu **Painel Super Admin** (`/admin`), onde poderá:
  - Monitorar o MRR global do SaaS e total de agendamentos.
  - Ver todos os salões cadastrados e o status de conexão da API do WhatsApp de cada um.
  - Suspender ou bloquear instâncias em caso de inadimplência.
  - Sobrescrever limites individuais por barbearia (ex: liberar mais profissionais).
  - Consultar logs de auditoria e erros em tempo real.

---

## ⚙️ Comandos Úteis & Manutenção

### Ver Logs em Tempo Real (Docker Compose)
```bash
# Ver logs de todos os serviços
docker compose logs -f

# Ver logs apenas da API / WhatsApp
docker compose logs -f server

# Ver logs do Frontend Next.js
docker compose logs -f web
```

### Atualizar o Sistema (Novo Commit do Git)
```bash
cd /var/www/barberflow
git pull origin main
docker compose up -d --build
```

### Reiniciar Serviços
```bash
docker compose restart server
```

### Acessar o Prisma Studio (Visualizador de Banco)
```bash
cd apps/server
npx prisma studio
```
Acesse `http://localhost:5555` para inspecionar todas as tabelas do banco de dados graficamente.

---

## 📄 Licença

Este projeto é proprietário e desenvolvido para gestão SaaS de barbearias e salões. Todos os direitos reservados.