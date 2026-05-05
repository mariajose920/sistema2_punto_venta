import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

// URL y clave anónima (anon key) de tu proyecto de Supabase.
// Asegúrate de definir estas variables en tu archivo .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';

/**
 * Cliente de Supabase inicializado.
 * Se utiliza el tipo `Database` generado para obtener autocompletado y seguridad de tipos 
 * en todas las consultas a la base de datos.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
