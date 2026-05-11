import { createClient } from '@supabase/supabase-js';

// Las variables deben estar seteadas en el ambiente o ser pegadas aquí temporalmente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'TU_URL_AQUI';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'TU_KEY_AQUI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('Usuario')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error selecting from Usuario:', error);
  } else {
    console.log('Columns in Usuario:', Object.keys(data[0] || {}));
  }
}

checkColumns();
