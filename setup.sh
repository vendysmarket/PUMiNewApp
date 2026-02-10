#!/bin/bash

# PUMi Quick Setup Script
# This script helps you set up PUMi for local development

set -e

echo "🚀 PUMi Quick Setup"
echo "===================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.12+ first."
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ Python: $(python3 --version)"
echo ""

# Setup Backend
echo "📦 Setting up backend..."
cd backend

if [ ! -f ".env" ]; then
    echo "Creating .env from template..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env with your API keys before running!"
else
    echo "✅ .env already exists"
fi

echo "Installing Python dependencies..."
pip3 install -r requirements.txt

cd ..
echo "✅ Backend setup complete"
echo ""

# Setup Frontend
echo "📦 Setting up frontend..."
cd frontend

if [ ! -f ".env.local" ]; then
    echo "Creating .env.local from template..."
    cp .env .env.local
    echo "⚠️  Please edit frontend/.env.local with your Supabase keys if needed"
else
    echo "✅ .env.local already exists"
fi

echo "Installing npm dependencies..."
npm install

cd ..
echo "✅ Frontend setup complete"
echo ""

# Summary
echo "🎉 Setup Complete!"
echo "===================="
echo ""
echo "Next steps:"
echo ""
echo "1. Edit backend/.env with your API keys:"
echo "   - ANTHROPIC_API_KEY"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "   - STRIPE_SECRET_KEY (optional for now)"
echo ""
echo "2. Start the backend:"
echo "   cd backend && python3 start.py"
echo ""
echo "3. In a new terminal, start the frontend:"
echo "   cd frontend && npm run dev"
echo ""
echo "4. Visit http://localhost:5173"
echo ""
echo "📚 For detailed setup instructions, see docs/DEPLOYMENT.md"
echo ""
