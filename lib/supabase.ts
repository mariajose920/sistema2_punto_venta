import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

/**
 * CONFIGURACIÓN DE SUPABASE
 * Este archivo centraliza la conexión con el backend de Supabase.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validación de presencia de variables (Error fatal si no existen)
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'FALTAN VARIABLES DE ENTORNO: Revisa que NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY estén configuradas en tu archivo .env o en el panel de Vercel.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
