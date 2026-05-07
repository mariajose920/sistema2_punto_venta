import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

/**
 * CONFIGURACIÓN DE SUPABASE
 * Este archivo centraliza la conexión con el backend de Supabase.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

// Validación de presencia y formato de variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('CONFIGURACIÓN INCOMPLETA: Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel.');
}

// Validación de seguridad: Evitar que se use la URL de Vercel como URL de Supabase
if (supabaseUrl.includes('vercel.app') || !supabaseUrl.startsWith('https://')) {
  throw new Error(`URL DE SUPABASE INVÁLIDA: La URL "${supabaseUrl}" no parece ser un endpoint de Supabase legítimo. Debe empezar con https:// y ser del tipo xxxxx.supabase.co`);
}

// Limpiar URL de posibles barras finales que rompen el fetch
const cleanUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;

export const supabase = createClient<Database>(cleanUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
