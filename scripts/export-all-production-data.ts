/**
 * Export ALL data from production D1 via API
 * Usage: npx tsx scripts/export-all-production-data.ts <CF_Authorization_cookie>
 */

import https from 'https';

const PRODUCTION_URL = 'https://jobsearch-tracker.kongaiwen.dev';

async function fetchFromProduction(endpoint: string, cookie: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, PRODUCTION_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Cookie': `CF_Authorization=${cookie}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function exportAllData(cookie: string) {
  console.log('📊 Fetching data from production...\n');

  const [employers, contacts, templates] = await Promise.all([
    fetchFromProduction('/api/employers', cookie).catch(() => []),
    fetchFromProduction('/api/contacts', cookie).catch(() => []),
    fetchFromProduction('/api/templates', cookie).catch(() => []),
  ]);

  console.log('✅ Data retrieved!\n');
  console.log(`   Employers: ${Array.isArray(employers) ? employers.length : 'N/A'}`);
  console.log(`   Contacts: ${Array.isArray(contacts) ? contacts.length : 'N/A'}`);
  console.log(`   Templates: ${Array.isArray(templates) ? templates.length : 'N/A'}`);
  console.log('');

  const data = {
    exportedAt: new Date().toISOString(),
    employers,
    contacts,
    templates,
    outreach: [], // API endpoint for outreach might not exist yet
    informationals: [], // API endpoint for informationals might not exist yet
  };

  const fs = await import('fs');
  const outputFile = '/home/evie-marie/Projects/2hjs-tracker/exports/production-data.json';
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

  console.log(`💾 Saved to: ${outputFile}`);
  console.log(`📏 Size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);

  // Show some sample data
  if (Array.isArray(employers) && employers.length > 0) {
    console.log('\n📋 Sample employers:');
    employers.slice(0, 5).forEach((e: any) => {
      console.log(`   - ${e.name} (M:${e.motivation}, P:${e.posting}, A:${e.advocacy})`);
    });
    if (employers.length > 5) {
      console.log(`   ... and ${employers.length - 5} more`);
    }
  }
}

async function main() {
  const cookie = process.argv[2];

  if (!cookie) {
    console.log('❌ CF_Authorization cookie required\n');
    console.log('Usage: npx tsx scripts/export-all-production-data.ts <cookie>\n');
    console.log('Steps:');
    console.log('1. Log in to https://jobsearch-tracker.kongaiwen.dev');
    console.log('2. Open DevTools → Application → Cookies');
    console.log('3. Copy CF_Authorization value');
    console.log('4. Run this script with that value');
    process.exit(1);
  }

  await exportAllData(cookie);
}

main().catch(console.error);
