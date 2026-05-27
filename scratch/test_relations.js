const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function test() {
  const { data: d1, error: e1 } = await supabase.from('DetalleVenta').select('*, Producto(nombre)').limit(1);
  console.log('Test 1 (Producto):', e1 ? e1.message : 'SUCCESS');
  
  const { data: d2, error: e2 } = await supabase.from('DetalleVenta').select('*, producto:id_producto(nombre)').limit(1);
  console.log('Test 2 (id_producto):', e2 ? e2.message : 'SUCCESS');
  
  const { data: d3, error: e3 } = await supabase.from('DetalleVenta').select('*, producto(nombre)').limit(1);
  console.log('Test 3 (producto):', e3 ? e3.message : 'SUCCESS');

  const { data: v1, error: ve1 } = await supabase.from('Venta').select('*, usuario:Usuario(nombre)').limit(1);
  console.log('Test V1 (Usuario):', ve1 ? ve1.message : 'SUCCESS');

  const { data: v2, error: ve2 } = await supabase.from('Venta').select('*, usuario:id_usuario_cajera(nombre)').limit(1);
  console.log('Test V2 (id_usuario_cajera):', ve2 ? ve2.message : 'SUCCESS');
}
test();
