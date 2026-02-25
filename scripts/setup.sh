#!/bin/bash

# 2HJS Tracker Setup Script
# This script sets up the 2-Hour Job Search Tracker application

set -e

PROJECT_DIR="/home/evie-marie/Projects/2hjs-tracker"
SERVICE_FILE="$PROJECT_DIR/scripts/2hjs-tracker.service"

echo "=========================================="
echo "2HJS Tracker Setup"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Please edit .env and add your API keys:"
    echo "  - GOOGLE_CLIENT_ID"
    echo "  - GOOGLE_CLIENT_SECRET"
    echo "  - ANTHROPIC_API_KEY"
    echo ""
fi

# Build Docker images
echo "Building Docker images..."
docker compose build

# Start services
echo "Starting services..."
docker compose up -d

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 5

# Run database migrations
echo "Running database migrations..."
docker compose exec backend npx prisma db push

# Seed default templates
echo "Seeding default templates..."
curl -X POST http://localhost:3001/api/templates/seed || echo "Note: Seed endpoint call failed, you can run it from the app"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Access the application at: http://localhost:5173"
echo "API is running at: http://localhost:3001"
echo ""
echo "To set up auto-start on login, run:"
echo "  mkdir -p ~/.config/systemd/user"
echo "  cp $SERVICE_FILE ~/.config/systemd/user/"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user enable 2hjs-tracker.service"
echo "  loginctl enable-linger \$USER"
echo ""
echo "To manually start/stop the service:"
echo "  docker compose up -d    # Start"
echo "  docker compose down     # Stop"
echo "  docker compose logs -f  # View logs"
echo ""
