const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/Venta?select=*,DetalleVenta:DetalleVenta!detalleventa_id_venta_fkey(cantidad,Producto:Producto!detalleventa_id_producto_fkey(nombre))&limit=1`;

async function test(queryUrl) {
  console.log('Testing:', queryUrl);
  try {
    const res = await fetch(queryUrl, {
      headers: {
        'apikey': env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      }
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test(url);
