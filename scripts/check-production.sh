#!/bin/bash
# Helper script to get CF_Authorization cookie and query production DB

echo "🔐 To get your CF_Authorization cookie:"
echo ""
echo "1. Open a terminal and run:"
echo "   firefox https://jobsearch-tracker.kongaiwen.dev"
echo ""
echo "2. Once logged in, press F12 to open DevTools"
echo "3. Go to Application → Cookies"
echo "4. Find 'CF_Authorization' and copy its Value"
echo ""
echo "5. Then run:"
echo "   npx tsx scripts/export-all-production-data.ts '<paste_value_here>'"
echo ""
echo "Or use curl directly:"
echo ""
read -p "Paste your CF_Authorization cookie (or press Enter to skip): " COOKIE

if [ -n "$COOKIE" ]; then
    echo ""
    echo "📊 Querying production database..."
    echo ""

    echo "Employers count:"
    curl -s -H "Cookie: CF_Authorization=$COOKIE" \
        "https://jobsearch-tracker.kongaiwen.dev/api/employers" | \
        python3 -c "import json,sys; data=json.load(sys.stdin); print(f'   {len(data)} employers')"

    echo ""
    echo "Contacts count:"
    curl -s -H "Cookie: CF_Authorization=$COOKIE" \
        "https://jobsearch-tracker.kongaiwen.dev/api/contacts" | \
        python3 -c "import json,sys; data=json.load(sys.stdin); print(f'   {len(data)} contacts')"

    echo ""
    echo "Templates count:"
    curl -s -H "Cookie: CF_Authorization=$COOKIE" \
        "https://jobsearch-tracker.kongaiwen.dev/api/templates" | \
        python3 -c "import json,sys; data=json.load(sys.stdin); print(f'   {len(data)} templates')"
else
    echo "No cookie provided. Run the script again with your cookie."
fi
