#!/bin/bash
# Check what data exists in production D1 database
# Requires wrangler to be installed and authenticated

echo "🔍 Checking production D1 database..."
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler not found. Install with: npm install -g wrangler"
    echo "   Then authenticate with: wrangler login"
    exit 1
fi

DB_NAME="2hjs-tracker-db"

echo "📊 Table counts:"
echo ""

tables=("User" "Employer" "Contact" "Outreach" "Informational" "EmailTemplate" "ChatMessage" "Settings")

for table in "${tables[@]}"; do
    echo -n "   $table: "
    result=$(wrangler d1 execute "$DB_NAME" --command="SELECT COUNT(*) as count FROM $table" --json 2>/dev/null)
    if [ $? -eq 0 ]; then
        count=$(echo "$result" | jq -r '.[0].results[0].count // "error"')
        echo "$count"
    else
        echo "query failed"
    fi
done

echo ""
echo "💡 If you see data above, you can export it with:"
echo "   wrangler d1 execute $DB_NAME --command='SELECT * FROM Employer' --json > employers.json"
echo ""
echo "🔧 To run raw SQL queries:"
echo "   wrangler d1 execute $DB_NAME --command=\"SELECT * FROM Employer LIMIT 10\""
