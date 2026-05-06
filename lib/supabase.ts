import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

/**
 * CONFIGURACIÓN DE SUPABASE
 * Este archivo centraliza la conexión con el backend de Supabase.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validación estricta de variables de entorno
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ ADVERTENCIA: Faltan variables de entorno de Supabase. ' +
    'Asegúrese de configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en su archivo .env'
  );
}

/**
 * Cliente de Supabase tipado.
 * Proporciona autocompletado para tablas, columnas y tipos de datos
 * definidos en types/database.types.ts
 */
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder_key'
);
