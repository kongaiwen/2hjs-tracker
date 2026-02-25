#!/bin/bash
# Sync secrets from .env file to Cloudflare Workers

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Syncing secrets from .env to Cloudflare Workers...${NC}"
echo ""

# Find the .env file (check common locations)
ENV_FILE=""
if [ -f "../../.env" ]; then
  ENV_FILE="../../.env"
elif [ -f ".env" ]; then
  ENV_FILE=".env"
elif [ -f "../.env" ]; then
  ENV_FILE="../.env"
else
  echo "Error: Could not find .env file"
  exit 1
fi

echo -e "${GREEN}Using .env file: ${ENV_FILE}${NC}"
echo ""

# Function to extract value from .env file
get_env_value() {
  grep "^${1}=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs
}

# Get values
JWT_SECRET=$(get_env_value "JWT_SECRET")
ADMIN_EMAIL=$(get_env_value "ADMIN_EMAIL")
CLOUDFLARE_API_TOKEN=$(get_env_value "CLOUDFLARE_API_TOKEN")

# Validate
if [ -z "$JWT_SECRET" ]; then
  echo "⚠️  JWT_SECRET not found in .env file - skipping"
else
  echo "Setting JWT_SECRET..."
  echo "$JWT_SECRET" | wrangler secret put JWT_SECRET
fi

echo ""

if [ -z "$ADMIN_EMAIL" ]; then
  echo "⚠️  ADMIN_EMAIL not found in .env file - using your email"
  # Try to get email from git config or prompt
  ADMIN_EMAIL=$(git config user.email)
  if [ -z "$ADMIN_EMAIL" ]; then
    read -p "Enter your admin email: " ADMIN_EMAIL
  fi
fi

echo "Setting ADMIN_EMAIL to: $ADMIN_EMAIL"
echo "$ADMIN_EMAIL" | wrangler secret put ADMIN_EMAIL

echo ""
echo -e "${GREEN}✅ Secrets synced successfully!${NC}"
