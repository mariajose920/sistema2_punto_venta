import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';
import { debugLog } from './utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

if (!isSupabaseConfigured) {
  console.warn('[SupabaseConfig] CONFIGURACIÓN INCOMPLETA: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Se utilizarán placeholders para evitar caídas fatales.');
} else {
  debugLog('[SupabaseConfig] Cliente inicializado con URL:', supabaseUrl);
}

export const supabase = createClient<Database>(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder-domain-for-robustness.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key-for-robustness',
  {
    auth: {
      // PERF/BUILD FIX: No persistir sesión ni auto-refrescar en el servidor
      // porque 'autoRefreshToken: true' inicia un setInterval que cuelga el 'next build'.
      persistSession: typeof window !== 'undefined',
      autoRefreshToken: typeof window !== 'undefined',
      detectSessionInUrl: typeof window !== 'undefined',
    },
  }
);

