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
    const { data, error } = await supabase
      .from('Usuario')
      .select('rol')
      .eq('id', uid)
      .single();

    if (error || !data) return null;
    return (data as any).rol as Role;
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !active) {
        setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
        return;
      }

      const session = data.session;

      if (!session?.user) {
        setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
        return;
      }

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
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
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
