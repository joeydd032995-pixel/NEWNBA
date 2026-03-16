#!/usr/bin/env bash
set -e

echo "🏀 NBA Betting Analytics Platform - Setup"
echo "==========================================="

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required. Install from https://docker.com"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required."; exit 1; }

echo "✅ Dependencies found"

# Setup environment
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "📄 Created .env from .env.example (review and update secrets!)"
fi

echo ""
echo "Choose setup mode:"
echo "  1) Docker (recommended - runs everything in containers)"
echo "  2) Local development (requires PostgreSQL + Redis installed)"
echo ""
read -p "Enter choice [1/2]: " MODE

if [ "$MODE" = "2" ]; then
  # Local development
  echo ""
  echo "📦 Installing backend dependencies..."
  cd backend && npm install

  echo "📦 Installing frontend dependencies..."
  cd ../frontend && npm install
  cd ..

  echo "🗄️ Setting up database..."
  cd backend
  npx prisma generate
  npx prisma migrate dev --name init
  npx ts-node prisma/seed.ts
  cd ..

  echo ""
  echo "✅ Local setup complete!"
  echo ""
  echo "Start the services:"
  echo "  Backend:  cd backend && npm run start:dev"
  echo "  Frontend: cd frontend && npm run dev"

else
  # Docker setup
  echo ""
  echo "🐳 Starting Docker services..."
  docker-compose up -d postgres redis

  echo "⏳ Waiting for database to be ready..."
  sleep 5

  echo "📦 Installing backend dependencies..."
  docker-compose run --rm backend npm install

  echo "🗄️ Running database migrations..."
  docker-compose run --rm backend npx prisma migrate dev --name init

  echo "🌱 Seeding database..."
  docker-compose run --rm backend npx ts-node prisma/seed.ts

  echo "🚀 Starting all services..."
  docker-compose up -d

  echo ""
  echo "✅ Docker setup complete!"
  echo ""
  echo "Services:"
  echo "  Frontend:  http://localhost:5173"
  echo "  Backend:   http://localhost:3000/api"
  echo "  API Docs:  http://localhost:3000/api/docs"
  echo ""
  echo "Demo accounts:"
  echo "  admin@newnba.com | admin123  (PREMIUM)"
  echo "  pro@newnba.com   | pro123    (PRO)"
  echo "  user@newnba.com  | user123   (FREE)"
fi
