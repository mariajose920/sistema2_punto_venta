import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Exportamos el tipo Role para que sea accesible desde otros componentes
export type Role = 'admin' | 'cajera' | 'proveedor';

type AuthState = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  isMounted: boolean; // Necesario para evitar errores de hidratación
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    isMounted: false,
  });

  const fetchRole = async (uid: string): Promise<Role | null> => {
    console.log('[AuthHook] Verificando rol para UID:', uid);
    
    const { data, error } = await supabase
      .from('Usuario')
      .select('rol')
      .eq('id', uid)
      .single();

    if (error) {
      console.error('[AuthHook] ERROR al obtener rol:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return null;
    }
    
    if (!data) {
      console.warn('[AuthHook] No se encontró perfil para UID (data es null):', uid);
      return null;
    }

    console.log('[AuthHook] Rol cargado correctamente:', (data as any).rol);
    return (data as any).rol as Role;
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      console.log('[AuthHook] Iniciando validación de sesión...');
      const { data, error } = await supabase.auth.getSession();
      console.log('[AuthHook] getSession result:', { data, error });

      if (error || !active) {
        if (error) console.error('[AuthHook] Error en getSession:', error);
        setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
        return;
      }

      const session = data.session;

      if (!session?.user) {
        console.log('[AuthHook] No hay usuario en la sesión.');
        setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
        return;
      }

      console.log('[AuthHook] Sesión activa para:', {
        id: session.user.id,
        email: session.user.email
      });

      const role = await fetchRole(session.user.id);

      if (!active) return;
      setState({
        user: session.user,
        role,
        loading: false,
        isMounted: true,
      });
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthHook] onAuthStateChange event:', event);
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        console.log('[AuthHook] Login detectado para:', session.user.id);
        const role = await fetchRole(session.user.id);
        if (!active) return;
        setState(prev => ({
          ...prev,
          user: session.user,
          role,
          loading: false,
        }));
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
