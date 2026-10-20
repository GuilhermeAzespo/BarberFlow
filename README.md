<img width="669" height="373" alt="Logo" src="https://github.com/user-attachments/assets/38fd55ae-2a18-4d8e-9ce3-e5bc4ddc1483" />


# BarberFlow 💈⚡

Plataforma SaaS multi-tenant moderna e 100% automatizada para gestão de barbearias e salões de beleza, com agendamentos em tempo real via WhatsApp, controle de fluxo de caixa e painel Super Admin para gestão global da plataforma.

---

## 📑 Sumário

- [Visão Geral & Recursos](#-visão-geral--recursos)
- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Guia Definitivo: Deploy no Easypanel (App com Dockerfile)](#-guia-definitivo-deploy-no-easypanel-com-dockerfile)
- [Solução de Erros Comuns no Easypanel](#-solução-de-erros-comuns-no-easypanel)
- [Guia: Instalação no Linux / VPS com Docker Compose](#-guia-instalação-no-linux--vps-com-docker-compose)
- [Guia: Instalação Direta no Linux (Bare-Metal com PM2)](#-guia-instalação-direta-no-linux-sem-docker---pm2)
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
| **Containers** | Dockerfile unificado All-in-One (Backend + Frontend no mesmo container) ou Docker Compose |

---

## 📁 Estrutura do Projeto

```text
BarberFlow/
├── apps/
│   ├── server/                     # Backend API & WhatsApp Engine (Node.js 22 + Prisma 6)
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Modelos de dados multi-tenant
│   │   ├── src/                    # Código fonte da API e motor do bot
│   │   ├── Dockerfile              # Build individual do servidor
│   │   └── package.json
│   │
│   └── web/                        # Frontend Next.js 15 (App Router)
│       ├── src/                    # Telas públicas, onboarding, painel do salão e super admin
│       ├── Dockerfile              # Build individual do web
│       └── package.json
│
├── Dockerfile                      # Dockerfile unificado All-in-One (App no Easypanel)
├── docker-entrypoint.sh            # Script de inicialização unificado (Prisma migrate + Server + Web)
├── .env.example                    # Template de variáveis de ambiente
├── .gitignore                      # Regras de exclusão do Git
├── docker-compose.yml              # Compose de produção alternativo
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
| `DATABASE_URL` | String de conexão com o PostgreSQL | `postgresql://barberflow:senha@db:5432/barberflow?schema=public` |
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

## 🚀 Guia Definitivo: Deploy no Easypanel (Com Dockerfile)

Sim! Fazer o deploy usando o **Dockerfile** (tipo **App**) no Easypanel é **muito mais simples, leve e estável** do que o Docker Compose tradicional, pois o Easypanel gerencia nativamente o PostgreSQL e você só precisa configurar 1 única aplicação.

O repositório já conta com o [`Dockerfile`](./Dockerfile) na raiz que compila e roda tanto a API quanto o Next.js no mesmo container com latência zero e 1 único domínio!

---

### Passo 1: Criar o Banco PostgreSQL no Easypanel
1. No seu Easypanel, entre no seu projeto (ex: `barberflow`).
2. Clique no botão **+ Serviço** (canto superior direito).
3. Selecione **Banco de Dados** > **PostgreSQL**.
4. Defina o nome como `db`.
5. Clique em **Criar**. O Easypanel subirá o PostgreSQL e gerará uma string de conexão interna chamada `DATABASE_URL` (ou você pode ver os dados de host, usuário e senha na aba do serviço).

---

### Passo 2: Criar o Serviço da Aplicação (App)
1. No mesmo projeto, clique novamente em **+ Serviço**.
2. Selecione a opção **App** (Aplicação).
3. Defina o nome como `barberflow-app`.
4. Na aba **Fonte**, selecione **Git** (ou **Github** se tiver conectado sua conta):
   - **URL do Repositório:** `https://github.com/GuilhermeAzespo/BarberFlow`
   - **Ramo (Branch):** `main` *(Atenção: certifique-se de digitar `main` e não `mian`)*
   - **Caminho de Build:** `/` *(raiz do projeto)*
5. O Easypanel detectará automaticamente o arquivo `Dockerfile` presente na raiz do repositório.

> 🔒 **Se o seu repositório no GitHub for privado:**
> - Clique no botão **"Gerar Chave SSH"** logo abaixo dos campos no Easypanel.
> - Copie a chave pública gerada (`ssh-ed25519 ...` ou `ssh-rsa ...`).
> - No GitHub, vá no seu repositório > **Settings** > **Deploy keys** > **Add deploy key**, dê o nome "Easypanel", marque "Allow write access" (opcional) e salve.
> - Altere a URL do repositório no Easypanel para o formato SSH: `git@github.com:GuilhermeAzespo/BarberFlow.git`.

---

### Passo 3: Configurar as Variáveis de Ambiente
Na aba **Ambiente** (Environment) do serviço `barberflow-app`, adicione:

```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@db:5432/postgres?schema=public
JWT_SECRET=seu-segredo-com-pelo-menos-32-caracteres-aqui
JWT_EXPIRES_IN=7d
COOKIE_SECURE=true
LOG_LEVEL=info
TRIAL_DAYS=14
WHATSAPP_ENABLED=true

SUPER_ADMIN_NAME=Super Admin
SUPER_ADMIN_EMAIL=admin@seudominio.com
SUPER_ADMIN_PASSWORD=SuaSenhaDeAcessoMaster123
```
*(Substitua `DATABASE_URL` pela URL de conexão interna do serviço de PostgreSQL criado no Passo 1).*

---

### Passo 4: Configurar o Domínio Público
1. Vá na aba **Domínios** do serviço `barberflow-app`.
2. Adicione seu domínio ou subdomínio (ex: `barberflow.seudominio.com`).
3. Defina a porta como **`3000`**.
4. O Easypanel cuidará do roteamento e emitirá o certificado SSL (HTTPS) automaticamente via Let's Encrypt.

---

### Passo 5: Implantar (Deploy)
1. Clique no botão verde **Implantar** (Deploy).
2. O Easypanel fará o build do Dockerfile, executará automaticamente o script [`docker-entrypoint.sh`](./docker-entrypoint.sh) que roda as migrações com `npx prisma migrate deploy`, inicializa a API na porta 4000 e o Next.js 15 na porta 3000.
3. Pronto! Acesse seu domínio pelo navegador.

---

## 🛠️ Solução de Erros Comuns no Easypanel

### 1. `Failed to clone repository`
- **Causa A (Digitação):** O campo "Ramo *" estava preenchido como `mian` em vez de `main`. O Git não encontrou a branch. Corrija para `main`.
- **Causa B (Repositório Privado):** Se o repositório for privado, o Git via HTTPS anônimo será recusado. Gere a Chave SSH no Easypanel e cole nas **Deploy Keys** do GitHub (ou utilize a aba **Github** com login OAuth).

### 2. `Database connection error` no boot
- Certifique-se de que o serviço do PostgreSQL no Easypanel está com status verde (ativo) antes de fazer o deploy da aplicação.
- A `DATABASE_URL` deve usar o nome interno do serviço no Easypanel (geralmente `db:5432` ou `postgres:5432`).

---

## 🐧 Guia: Instalação no Linux / VPS com Docker Compose

Recomendado para servidores VPS rodando **Ubuntu 22.04 / 24.04 LTS** ou **Debian 12**.

### Requisitos Mínimos do Servidor
- **CPU:** 2 vCPU
- **Memória RAM:** 2 GB ou superior
- **Disco:** 20 GB SSD
- **Portas Abertas:** 80 (HTTP), 443 (HTTPS) e 22 (SSH)

---

### Passo 1: Atualizar o Sistema e Instalar o Docker
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

---

### Passo 2: Clonar o Repositório
```bash
git clone https://github.com/GuilhermeAzespo/BarberFlow.git /var/www/barberflow
cd /var/www/barberflow
```

---

### Passo 3: Configurar o `.env`
```bash
cp .env.example .env
nano .env
```
Preencha as senhas, segredo JWT e dados do Super Admin.

---

### Passo 4: Subir a Stack com Portas Locais
Crie o arquivo `docker-compose.override.yml`:
```yaml
services:
  web:
    ports:
      - "127.0.0.1:3000:3000"
```

Inicie os containers:
```bash
docker compose up -d --build
```

---

### Passo 5: Configurar Nginx + SSL Grátis (Certbot)
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crie o arquivo de configuração do Nginx:
```bash
sudo nano /etc/nginx/sites-available/barberflow
```

Cole o conteúdo (substitua `app.seudominio.com`):
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

Ative o site e gere o certificado:
```bash
sudo ln -s /etc/nginx/sites-available/barberflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.seudominio.com
```

---

## 🖥️ Guia: Instalação Direta no Linux (Sem Docker - PM2)

### Passo 1: Instalar Node.js 22, PostgreSQL 16 e PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential postgresql postgresql-contrib
sudo npm install -g pm2
```

### Passo 2: Criar o Banco de Dados
```bash
sudo -u postgres psql -c "CREATE USER barberflow WITH PASSWORD 'sua_senha_segura';"
sudo -u postgres psql -c "CREATE DATABASE barberflow OWNER barberflow;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE barberflow TO barberflow;"
```

### Passo 3: Compilar e Iniciar a API
```bash
cd /var/www/barberflow/apps/server
cp .env.example .env
# Configure a DATABASE_URL no .env
npm install
npx prisma migrate deploy
npm run build
pm2 start dist/index.js --name "barberflow-server"
```

### Passo 4: Compilar e Iniciar o Frontend Next.js
```bash
cd /var/www/barberflow/apps/web
npm install
npm run build
pm2 start npm --name "barberflow-web" -- start -- -p 3000
pm2 save
pm2 startup
```

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

### Ver Logs em Tempo Real (Docker)
```bash
# Se estiver usando Docker Compose
docker compose logs -f server

# Se estiver usando container Dockerfile direto
docker logs -f barberflow-app
```

### Atualizar a Aplicação
No Easypanel, basta clicar no botão **Implantar** (ou configurar o Webhook do GitHub para deploy contínuo automático a cada push).

---

## 📄 Licença

Este projeto é proprietário e desenvolvido para gestão SaaS de barbearias e salões. Todos os direitos reservados.
