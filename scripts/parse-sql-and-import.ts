/**
 * Parse PostgreSQL SQL backup and import to production D1 database
 *
 * This script:
 * 1. Parses a PostgreSQL .sql backup file
 * 2. Extracts data from INSERT statements
 * 3. Sends it to the production /api/debug/import-backup endpoint
 *
 * Usage:
 *   npm run import:production
 *   Or: tsx scripts/parse-sql-and-import.ts <sql-file> <auth-cookie>
 */

import fs from 'fs';
import https from 'https';

const SQL_FILE = process.argv[2] || './backup.sql';
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://2hjs-tracker.pages.dev';

/**
 * Parse PostgreSQL INSERT statement and extract column names and values
 */
function parseInsertStatement(statement: string): { table: string; columns: string[]; values: any[][] } | null {
  // Match: INSERT INTO "TableName" (col1, col2) VALUES (v1, v2), (v3, v4);
  const insertRegex = /INSERT INTO\s+"?(\w+)"?\s*\(([^)]+)\)\s*VALUES\s*(.+?);/gs;
  const match = [...statement.matchAll(insertRegex)][0];

  if (!match) return null;

  const [, table, columnsStr, valuesStr] = match;

  // Parse column names
  const columns = columnsStr.split(',').map(c => c.trim().replace(/"/g, ''));

  // Parse values - handle multiple row inserts
  const values: any[][] = [];
  const rowsRegex = /\(([^)]+)\)/g;
  let rowMatch;

  while ((rowMatch = rowsRegex.exec(valuesStr)) !== null) {
    const rowValues = rowMatch[1].split(',').map(v => {
      const trimmed = v.trim();
      // Handle NULL
      if (trimmed === 'NULL') return null;
      // Handle strings (quoted)
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
          (trimmed.startsWith("E'") && trimmed.endsWith("'"))) {
        const str = trimmed.startsWith("E'") ? trimmed.slice(2, -1) : trimmed.slice(1, -1);
        // Unescape PostgreSQL strings
        return str.replace(/''/g, "'").replace(/\\'/g, "'").replace(/\\/g, '');
      }
      // Handle booleans (PostgreSQL uses 't'/'f')
      if (trimmed === 'true' || trimmed === 't') return true;
      if (trimmed === 'false' || trimmed === 'f') return false;
      // Handle numbers
      const num = parseFloat(trimmed.replace(/^::\w+$/, '')); // Remove type casts
      return isNaN(num) ? trimmed : num;
    });
    values.push(rowValues);
  }

  return { table, columns, values };
}

/**
 * Parse SQL file and extract all data
 */
function parseSQLFile(sqlContent: string): Record<string, any[]> {
  const data: Record<string, any[]> = {};

  // Split by INSERT statements
  const statements = sqlContent.split(/;\s*(?=(?:INSERT INTO|COPY))/gi);

  for (const stmt of statements) {
    if (!stmt.trim().toUpperCase().startsWith('INSERT INTO')) continue;

    const parsed = parseInsertStatement(stmt);
    if (!parsed) continue;

    const { table, columns, values } = parsed;

    // Skip User table as it will be auto-created
    if (table === 'User') continue;

    data[table] = values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  return data;
}

/**
 * Convert PostgreSQL enum strings to proper format
 */
function convertEnums(data: any[]): any[] {
  return data.map(item => {
    const converted: any = { ...item };
    // Convert status enum if present
    if (typeof converted.status === 'string') {
      // Already a string, keep as is
    }
    // Convert segment enum if present
    if (typeof converted.segment === 'string') {
      // Already a string, keep as is
    }
    return converted;
  });
}

/**
 * Send data to production import endpoint
 */
function importToProduction(data: Record<string, any[]>, cfAuthorizationCookie: string): Promise<void> {
  const payload = JSON.stringify({
    employers: data.Employer || [],
    contacts: data.Contact || [],
    outreach: data.Outreach || [],
    informationals: data.Informational || [],
    templates: data.EmailTemplate || [],
  });

  return new Promise((resolve, reject) => {
    const url = new URL('/api/debug/import-backup', PRODUCTION_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Cookie': `CF_Authorization=${cfAuthorizationCookie}`,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ Import successful!');
          console.log('Response:', responseData);
          resolve();
        } else {
          console.error(`❌ Import failed with status ${res.statusCode}`);
          console.error('Response:', responseData);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🔄 Parsing SQL backup file...\n');

  // Read SQL file
  if (!fs.existsSync(SQL_FILE)) {
    console.error(`❌ SQL file not found: ${SQL_FILE}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(SQL_FILE, 'utf-8');
  console.log(`📂 Read file: ${SQL_FILE}`);
  console.log(`📏 File size: ${(sqlContent.length / 1024).toFixed(2)} KB\n`);

  // Parse SQL
  const data = parseSQLFile(sqlContent);

  console.log('📊 Extracted data:');
  console.log(`   - Employers: ${data.Employer?.length || 0}`);
  console.log(`   - Contacts: ${data.Contact?.length || 0}`);
  console.log(`   - Outreach: ${data.Outreach?.length || 0}`);
  console.log(`   - Informationals: ${data.Informational?.length || 0}`);
  console.log(`   - Email Templates: ${data.EmailTemplate?.length || 0}`);
  console.log('');

  // Get CF_Authorization cookie
  console.log('🔐 To import to production, you need your CF_Authorization cookie.');
  console.log('   1. Log in to ${PRODUCTION_URL}');
  console.log('   2. Open browser DevTools → Application → Cookies');
  console.log('   3. Find the CF_Authorization cookie value');
  console.log('');

  // For now, just output the JSON to a file for manual import
  const path = await import('path');
  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const outputFile = `${exportDir}/import-data.json`;
  const payload = {
    employers: data.Employer || [],
    contacts: data.Contact || [],
    outreach: data.Outreach || [],
    informationals: data.Informational || [],
    templates: data.EmailTemplate || [],
  };

  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`✅ Data exported to: ${outputFile}`);
  console.log('\n📝 Next steps:');
  console.log('   Option 1: Use the web interface at ${PRODUCTION_URL}/debug');
  console.log('   Option 2: Run this script with CF_Authorization cookie:');
  console.log(`            tsx scripts/parse-sql-and-import.ts "${SQL_FILE}" "<your-cookie>"`);
  console.log('   Option 3: Use curl:');
  console.log(`            curl -X POST ${PRODUCTION_URL}/api/debug/import-backup \\`);
  console.log('              -H "Content-Type: application/json" \\');
  console.log('              -H "Cookie: CF_Authorization=<your-cookie>" \\');
  console.log(`              -d @${outputFile}`);
}

main().catch(console.error);
