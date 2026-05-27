"use client";

import React, { createContext, useEffect, useState, ReactNode, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { debugLog, debugError } from '@/lib/utils';

export type Role = 'admin' | 'cajera' | 'proveedor';

export type AuthState = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  isMounted: boolean;
};

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    isMounted: false,
  });

  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    currentUserRef.current = state.user;
  }, [state.user]);

  useEffect(() => {
    let active = true;
    setTimeout(() => {
      setState(s => ({ ...s, isMounted: true }));
    }, 0);

    if (!isSupabaseConfigured) {
      debugError('[AuthContext] Supabase no configurado.');
      setTimeout(() => {
        setState(prev => ({ ...prev, loading: false }));
      }, 0);
      return;
    }

    const loadSession = async () => {
      try {
        const sessionStart = performance.now();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (process.env.NODE_ENV !== 'production') {
          console.log('[PERF][AUTH] getSession', {
            ms: Number((performance.now() - sessionStart).toFixed(2)),
            hasError: Boolean(error),
            errorMessage: error?.message ?? null,
            hasUser: Boolean(session?.user),
            userId: session?.user?.id ?? null,
          });
        }

        if (error || !session?.user) {
          if (active && !currentUserRef.current) {
            setState(prev => ({ ...prev, user: null, role: null, loading: false }));
          }
          return;
        }

        // Si ya fue procesado por onAuthStateChange, abortar
        if (currentUserRef.current?.id === session.user.id) {
          return;
        }
        currentUserRef.current = session.user;

        let userRole = (session.user.user_metadata?.rol as Role) || null;

        if (!userRole) {
          try {
            console.log(`\n\n=== [AUTH_CONTEXT] DIAGNÓSTICO DE LOGIN START ===`);
            console.log(`[AUTH_CONTEXT] User ID: ${session.user.id}`);
            console.log(`[AUTH_CONTEXT] Email: ${session.user.email}`);

            let { data: idData, error: idError, status: idStatus, statusText: idStatusText } = await (supabase.from('Usuario') as any)
              .select('*')
              .eq('id', session.user.id);
              
            console.log(`[AUTH_CONTEXT][QUERY_ID] Status: ${idStatus} ${idStatusText}`);
            console.log(`[AUTH_CONTEXT][QUERY_ID] Error:`, idError);
            console.log(`[AUTH_CONTEXT][QUERY_ID] Filas encontradas: ${idData ? idData.length : 0}`);
            console.log(`[AUTH_CONTEXT][QUERY_ID] Data devuelta:`, idData);

            let profile = idData && idData.length > 0 ? idData[0] : null;

            if (!profile && session.user.email) {
              console.log(`[AUTH_CONTEXT][INFO] Intentando rescate por EMAIL...`);
              const { data: emailData, error: emailError, status: emailStatus, statusText: emailStatusText } = await (supabase.from('Usuario') as any)
                .select('*')
                .eq('email', session.user.email);
                
              console.log(`[AUTH_CONTEXT][QUERY_EMAIL] Status: ${emailStatus} ${emailStatusText}`);
              console.log(`[AUTH_CONTEXT][QUERY_EMAIL] Error:`, emailError);
              console.log(`[AUTH_CONTEXT][QUERY_EMAIL] Filas encontradas: ${emailData ? emailData.length : 0}`);
              console.log(`[AUTH_CONTEXT][QUERY_EMAIL] Data devuelta:`, emailData);
              
              if (emailData && emailData.length > 0) profile = emailData[0];
            }

            if (profile && profile.rol) {
              userRole = profile.rol as Role;
              console.log(`[AUTH_CONTEXT][EXITO] Rol final obtenido: ${userRole}`);
            } else {
              console.warn(`[AUTH_CONTEXT][FALLO] No se encontró perfil válido ni por ID ni por Email.`);
            }
            console.log(`=== [AUTH_CONTEXT] DIAGNÓSTICO DE LOGIN END ===\n\n`);
          } catch (e) {
            debugError('[AuthContext] Error fetching profile:', e);
          }
        }

        if (!userRole) {
          await supabase.auth.signOut();
          if (active) {
            setState(prev => ({ ...prev, user: null, role: null, loading: false }));
            if (window.location.pathname === '/login') {
              window.history.replaceState({}, '', '/login?error=no_role');
              window.dispatchEvent(new Event('popstate'));
            } else {
              window.location.href = '/login?error=no_role';
            }
          }
          return;
        }

        if (active) {
          setState(prev => ({
            ...prev,
            user: session.user,
            role: userRole,
            loading: false,
          }));
        }
      } catch (err) {
        debugError('[AuthContext] Error en loadSession:', err);
        if (active && !currentUserRef.current) {
          setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        }
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;

      console.log('[AUTH_TRACE] onAuthStateChange event:', event, 'session:', session?.user?.id ?? null);

      if (event === 'SIGNED_OUT' || !session?.user) {
        currentUserRef.current = null;
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        return;
      }

      if (session?.user) {
        if (currentUserRef.current?.id === session.user.id) {
          return;
        }
        currentUserRef.current = session.user;

        let userRole = (session.user.user_metadata?.rol as Role) || null;

        if (!userRole) {
          try {
            console.log(`\n\n=== [AUTH_CONTEXT_CHANGE] DIAGNÓSTICO DE LOGIN START ===`);
            console.log(`[AUTH_CONTEXT_CHANGE] User ID: ${session.user.id}`);
            console.log(`[AUTH_CONTEXT_CHANGE] Email: ${session.user.email}`);

            let { data: idData, error: idError, status: idStatus, statusText: idStatusText } = await (supabase.from('Usuario') as any)
              .select('*')
              .eq('id', session.user.id);
              
            console.log(`[AUTH_CONTEXT_CHANGE][QUERY_ID] Status: ${idStatus} ${idStatusText}`);
            console.log(`[AUTH_CONTEXT_CHANGE][QUERY_ID] Error:`, idError);
            console.log(`[AUTH_CONTEXT_CHANGE][QUERY_ID] Filas encontradas: ${idData ? idData.length : 0}`);
            console.log(`[AUTH_CONTEXT_CHANGE][QUERY_ID] Data devuelta:`, idData);

            let profile = idData && idData.length > 0 ? idData[0] : null;

            if (!profile && session.user.email) {
              console.log(`[AUTH_CONTEXT_CHANGE][INFO] Intentando rescate por EMAIL...`);
              const { data: emailData, error: emailError, status: emailStatus, statusText: emailStatusText } = await (supabase.from('Usuario') as any)
                .select('*')
                .eq('email', session.user.email);
                
              console.log(`[AUTH_CONTEXT_CHANGE][QUERY_EMAIL] Status: ${emailStatus} ${emailStatusText}`);
              console.log(`[AUTH_CONTEXT_CHANGE][QUERY_EMAIL] Error:`, emailError);
              console.log(`[AUTH_CONTEXT_CHANGE][QUERY_EMAIL] Filas encontradas: ${emailData ? emailData.length : 0}`);
              console.log(`[AUTH_CONTEXT_CHANGE][QUERY_EMAIL] Data devuelta:`, emailData);
              
              if (emailData && emailData.length > 0) profile = emailData[0];
            }

            if (profile && profile.rol) {
              userRole = profile.rol as Role;
              console.log(`[AUTH_CONTEXT_CHANGE][EXITO] Rol final obtenido: ${userRole}`);
            } else {
              console.warn(`[AUTH_CONTEXT_CHANGE][FALLO] No se encontró perfil válido ni por ID ni por Email.`);
            }
            console.log(`=== [AUTH_CONTEXT_CHANGE] DIAGNÓSTICO DE LOGIN END ===\n\n`);
          } catch (e) {
            debugError('[AuthContext] Error fetching profile:', e);
          }
        }

        if (!userRole) {
          await supabase.auth.signOut();
          if (active) {
            setState(prev => ({ ...prev, user: null, role: null, loading: false }));
            if (window.location.pathname === '/login') {
              window.history.replaceState({}, '', '/login?error=no_role');
              window.dispatchEvent(new Event('popstate'));
              window.location.reload();
            } else {
              window.location.href = '/login?error=no_role';
            }
          }
          return;
        }

        if (active) {
          setState(prev => ({
            ...prev,
            user: session.user,
            role: userRole,
            loading: false,
          }));
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}
