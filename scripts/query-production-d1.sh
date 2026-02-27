#!/bin/bash
# Query production D1 database via the API
# Requires CF_Authorization cookie

PRODUCTION_URL="https://jobsearch-tracker.kongaiwen.dev"

echo "🔍 Querying production D1 database..."
echo ""
echo "This requires your CF_Authorization cookie."
echo "1. Log in to https://jobsearch-tracker.kongaiwen.dev"
echo "2. Open DevTools → Application → Cookies"
echo "3. Copy the CF_Authorization cookie value"
echo ""

if [ -z "$1" ]; then
    echo "Usage: $0 <CF_Authorization_cookie>"
    echo ""
    echo "Example:"
    echo "  $0 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'"
    exit 1
fi

COOKIE=$1

echo "📊 Fetching data counts..."
echo ""

# Query employers
echo "Employers:"
curl -s -H "Cookie: CF_Authorization=$COOKIE" \
    "$PRODUCTION_URL/api/employers" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'   Total: {len(data)}')
    if data:
        print(f'   Sample: {data[0].get(\"name\", \"N/A\")} (Motivation: {data[0].get(\"motivation\", \"N/A\")}, Posting: {data[0].get(\"posting\", \"N/A\")})')
except Exception as e:
    print(f'   Error: {e}')
"

echo ""
echo "Contacts:"
curl -s -H "Cookie: CF_Authorization=$COOKIE" \
    "$PRODUCTION_URL/api/contacts" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'   Total: {len(data)}')
    if data:
        print(f'   Sample: {data[0].get(\"name\", \"N/A\")} at {data[0].get(\"employerId\", \"N/A\")}')
except Exception as e:
    print(f'   Error: {e}')
"

echo ""
echo "Templates:"
curl -s -H "Cookie: CF_Authorization=$COOKIE" \
    "$PRODUCTION_URL/api/templates" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'   Total: {len(data)}')
    if data:
        print(f'   Sample: {data[0].get(\"name\", \"N/A\")} ({data[0].get(\"type\", \"N/A\")})')
except Exception as e:
    print(f'   Error: {e}')
"

echo ""
echo "✅ Done!"
echo ""
echo "To export all data, run:"
echo "  curl -H 'Cookie: CF_Authorization=$COOKIE' \\"
echo "    $PRODUCTION_URL/api/employers > employers.json"
