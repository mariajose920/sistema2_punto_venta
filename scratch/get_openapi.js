const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function getOpenAPI() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { 'apikey': key }
  });
  const data = await res.json();
  fs.writeFileSync('scratch/openapi.json', JSON.stringify(data, null, 2));
}

getOpenAPI();
