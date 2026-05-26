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

// Cache de promesas activas para deduplicar consultas concurrentes de rol por usuario (Request Coalescing)
const rolePromises = new Map<string, Promise<string | null>>();

export async function getUserRole(uid: string): Promise<string | null> {
  if (rolePromises.has(uid)) {
    console.log('[PERF_AUTH] [getUserRole] Deduplicando consulta de rol activa para UID:', uid);
    return rolePromises.get(uid)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from('Usuario')
        .select('rol')
        .eq('id', uid)
        .single();

      if (error) {
        console.error('[PERF_AUTH] Error en getUserRole para UID:', uid, error);
        return null;
      }
      return (data as { rol: string } | null)?.rol ?? null;
    } catch (err) {
      console.error('[PERF_AUTH] Excepción en getUserRole para UID:', uid, err);
      return null;
    } finally {
      rolePromises.delete(uid);
    }
  })();

  rolePromises.set(uid, promise);
  return promise;
}
