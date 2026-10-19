#!/bin/sh
set -e

echo "🚀 Iniciando BarberFlow All-in-One Container..."

# 1. Aplica migrations pendentes no PostgreSQL
echo "📦 Executando migrações do banco de dados (Prisma)..."
cd /app/server
npx prisma migrate deploy

# 2. Inicia o Backend API (Express + Baileys + WhatsApp Bot) na porta 4000 em background
echo "⚡ Iniciando BarberFlow API & WhatsApp Engine (porta 4000)..."
PORT=4000 node dist/index.js &
SERVER_PID=$!

# 3. Aguarda a API estar saudável antes de prosseguir
echo "⏳ Aguardando inicialização da API..."
for i in $(seq 1 30); do
  if node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "✅ API inicializada com sucesso!"
    break
  fi
  sleep 1
done

# Função de shutdown gracioso
shutdown() {
  echo "🛑 Encerrando BarberFlow graciosamente..."
  kill -TERM "$SERVER_PID" 2>/dev/null || true
  kill -TERM "$WEB_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  exit 0
}

trap shutdown SIGTERM SIGINT

# 4. Inicia o Frontend Next.js na porta 3000 em foreground
echo "🌐 Iniciando BarberFlow Frontend Next.js 15 (porta 3000)..."
cd /app/web
PORT=3000 HOSTNAME=0.0.0.0 node server.js &
WEB_PID=$!

# Mantém o container ativo aguardando os processos
wait -n "$SERVER_PID" "$WEB_PID"
