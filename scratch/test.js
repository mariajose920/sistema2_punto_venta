require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('Venta').select('*, DetalleVenta(cantidad, Producto(nombre))').limit(1);
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));

  const { data: d2, error: e2 } = await supabase.from('Venta').select('*, DetalleVenta(cantidad, producto:Producto!detalleventa_id_producto_fkey(nombre))').limit(1);
  console.log('Error 2:', e2);
  console.log('Data 2:', JSON.stringify(d2, null, 2));
}
run();
