const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function query(table, select) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log(`\n--- Query: ${table}?select=${select} ---`);
  if (!res.ok) {
    console.log('ERROR:', data);
  } else {
    console.log('SUCCESS:', JSON.stringify(data, null, 2));
  }
}

async function test() {
  await query('DetalleVenta', '*, Producto(nombre)');
  await query('DetalleVenta', '*, producto:id_producto(nombre)');
  await query('DetalleVenta', '*, producto:Producto(nombre)');
  await query('Venta', '*, usuario:Usuario(nombre)');
  await query('Venta', '*, usuario:id_usuario_cajera(nombre)');
  await query('Venta', '*, cliente:Cliente(nombre)');
  await query('Venta', '*, cliente:id_cliente(nombre)');
}
test();
