import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("No Supabase env vars found");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase.from('Producto').select('*').limit(1);
  if (error) {
    console.error("Error querying Producto:", error);
  } else {
    console.log("Producto columns:", data.length > 0 ? Object.keys(data[0]) : "No rows, cannot infer all columns but query succeeded");
  }
}

checkSchema();
