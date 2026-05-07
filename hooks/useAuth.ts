"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

// Tipos estrictos para los roles del sistema
export type Role = 'admin' | 'cajera' | 'proveedor' | null;

export interface AuthState {
  user: User | null;
  role: Role;
  loading: boolean;
  error: string | null;
  isMounted: boolean;
}

/**
 * Hook useAuth: Centraliza la lógica de autenticación y autorización.
 * Implementa un patrón de observación para mantener el estado sincronizado
 * con Supabase Auth y la tabla de perfiles 'Usuario'.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    error: null,
    isMounted: false,
  });

  /**
   * Obtiene el rol de un usuario desde la tabla 'Usuario' de la base de datos.
   */
  const fetchUserRole = useCallback(async (userId: string): Promise<Role> => {
    try {
      const { data, error } = await supabase
        .from('Usuario')
        .select('rol')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.warn('[useAuth] No se pudo obtener el rol. Verifique políticas RLS o configuración de Supabase URL.');
        return null;
      }
      
      const userRole = (data as { rol: string }).rol as Role;
      return userRole;
    } catch (err: any) {
      if (err.message?.includes('Unexpected token')) {
        console.error('[useAuth CRITICAL] Error de configuración de URL en Supabase. Se recibió HTML en lugar de JSON.');
      } else {
        console.error('[useAuth] Error inesperado:', err);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    // 1. Inicialización de sesión al cargar el componente
    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (session?.user) {
          const role = await fetchUserRole(session.user.id);
          if (active) {
            setState({ user: session.user, role, loading: false, error: null, isMounted: true });
          }
        } else {
          if (active) {
            setState({ user: null, role: null, loading: false, error: null, isMounted: true });
          }
        }
      } catch (err: any) {
        if (active) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: err.message || 'Error inicializando auth',
            isMounted: true
          }));
        }
      }
    };

    initializeAuth();

    // 2. Suscripción a cambios en tiempo real (Login, Logout, Token Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return;

        if (session?.user) {
          const currentRole = await fetchUserRole(session.user.id);
          setState({
            user: session.user,
            role: currentRole,
            loading: false,
            error: null,
            isMounted: true
          });
        } else {
          setState({ user: null, role: null, loading: false, error: null, isMounted: true });
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchUserRole]);

  return state;
}
