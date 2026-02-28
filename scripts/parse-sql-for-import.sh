#!/bin/bash
# Parse PostgreSQL SQL backup and prepare JSON for import to production
# Usage: ./scripts/parse-sql-for-import.sh [sql-file]

SQL_FILE="${1:-./backup.sql}"
EXPORT_DIR="$(cd "$(dirname "$0")" && pwd)/../exports"
OUTPUT_FILE="$EXPORT_DIR/import-data.json"

mkdir -p "$EXPORT_DIR"

echo "🔄 Parsing SQL backup file..."
echo "📂 File: $SQL_FILE"

# Create a temporary Node.js script to parse SQL
cat > /tmp/parse-sql.js << 'PARSESCRIPT'
const fs = require('fs');

const SQL_FILE = process.argv[2];
const OUTPUT_FILE = process.argv[3];

function parseSQLFile(sqlContent) {
  const data = { employers: [], contacts: [], outreach: [], informationals: [], templates: [] };

  // Extract data from COPY statements (PostgreSQL pg_dump format)
  // COPY "Employer" ("id", "name", ...) FROM stdin;
  const copyRegex = /COPY\s+"?(\w+)"?\s*\(([^)]+)\)\s+FROM\s+stdin;([\s\S]+?)\\\./g;

  let match;
  while ((match = copyRegex.exec(sqlContent)) !== null) {
    const [, tableName, columnsStr, dataStr] = match;

    if (tableName === 'User') continue; // Skip User table

    const columns = columnsStr.split(',').map(c => c.trim().replace(/"/g, ''));
    const rows = dataStr.trim().split('\n');

    // Map table names to output keys
    const tableKey = tableName === 'Employer' ? 'employers' :
                     tableName === 'Contact' ? 'contacts' :
                     tableName === 'Outreach' ? 'outreach' :
                     tableName === 'Informational' ? 'informationals' :
                     tableName === 'EmailTemplate' ? 'templates' : null;

    if (!tableKey) continue;

    for (const row of rows) {
      if (!row.trim()) continue;

      // Parse tab-separated values (PostgreSQL default format)
      const values = row.split('\t').map((v, i) => {
        const trimmed = v.trim();
        if (trimmed === '\\N') return null; // PostgreSQL NULL representation

        // Handle boolean strings
        if (trimmed === 't' || trimmed === 'true') return true;
        if (trimmed === 'f' || trimmed === 'false') return false;

        // Try to parse as number
        const num = Number(trimmed);
        if (!isNaN(num)) return num;

        return trimmed;
      });

      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = values[i];
      });

      data[tableKey].push(obj);
    }
  }

  // Also try INSERT statements format as fallback
  if (data.employers.length === 0 && data.contacts.length === 0) {
    const insertRegex = /INSERT INTO\s+"?(\w+)"?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\);?/g;
    sqlContent = sqlContent.replace(/\n\s+/g, ' '); // Flatten multi-line

    while ((match = insertRegex.exec(sqlContent)) !== null) {
      const [, tableName, columnsStr, valuesStr] = match;

      if (tableName === 'User') continue;

      const columns = columnsStr.split(',').map(c => c.trim().replace(/"/g, ''));
      const values = valuesStr.split(',').map(v => {
        const trimmed = v.trim();
        if (trimmed === 'NULL') return null;
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
          return trimmed.slice(1, -1).replace(/''/g, "'");
        }
        return trimmed;
      });

      const tableKey = tableName === 'Employer' ? 'employers' :
                       tableName === 'Contact' ? 'contacts' :
                       tableName === 'Outreach' ? 'outreach' :
                       tableName === 'Informational' ? 'informationals' :
                       tableName === 'EmailTemplate' ? 'templates' : null;

      if (!tableKey) continue;

      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = values[i];
      });

      data[tableKey].push(obj);
    }
  }

  return data;
}

const sqlContent = fs.readFileSync(SQL_FILE, 'utf-8');
const data = parseSQLFile(sqlContent);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

console.log(`✅ Data exported to: ${OUTPUT_FILE}`);
console.log(`📊 Summary:`);
console.log(`   - Employers: ${data.employers.length}`);
console.log(`   - Contacts: ${data.contacts.length}`);
console.log(`   - Outreach: ${data.outreach.length}`);
console.log(`   - Informationals: ${data.informationals.length}`);
console.log(`   - Templates: ${data.templates.length}`);
PARSESCRIPT

node /tmp/parse-sql.js "$SQL_FILE" "$OUTPUT_FILE"
rm /tmp/parse-sql.js

echo ""
echo "📝 To import this data to production:"
echo ""
echo "   1. Log in to ${PRODUCTION_URL:-https://2hjs-tracker.pages.dev}"
echo "   2. Open browser DevTools → Application → Cookies"
echo "   3. Copy the CF_Authorization cookie value"
echo ""
echo "   Then run:"
echo ""
echo "   curl -X POST ${PRODUCTION_URL:-https://2hjs-tracker.pages.dev}/api/debug/import-backup \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Cookie: CF_Authorization=<YOUR_COOKIE_HERE>' \\"
echo "     -d @$OUTPUT_FILE"
echo ""
echo "   Or open the file and use the data manually."
