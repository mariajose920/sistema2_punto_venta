import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase.from('Producto').select('codigo_barra').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Sample row:", data);
  }
}

checkSchema();
