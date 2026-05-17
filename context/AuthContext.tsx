"use client";

import React, { createContext, useEffect, useState, ReactNode, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { debugLog, debugError } from '@/lib/utils';

export type Role = 'admin' | 'cajera' | 'proveedor';

export type AuthState = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  isMounted: boolean;
};

export const AuthContext = createContext<AuthState | undefined>(undefined);

const roleCache = new Map<string, Role>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    isMounted: false,
  });

  const initialLoadDone = useRef(false);
  const currentUserRef = useRef<User | null>(null);

  // Mantener sincronizado el usuario actual para evitar closures obsoletos en callbacks asíncronos
  useEffect(() => {
    currentUserRef.current = state.user;
  }, [state.user]);

  const fetchRole = async (uid: string): Promise<Role | null> => {
    if (roleCache.has(uid)) {
      const cachedRole = roleCache.get(uid)!;
      debugLog('[AuthContext] Usando rol desde el caché en memoria para UID:', uid, '->', cachedRole);
      return cachedRole;
    }

    debugLog('[AuthContext] Verificando rol para UID:', uid);
    
    const { data, error } = await supabase
      .from('Usuario')
      .select('rol')
      .eq('id', uid)
      .single();

    if (error) {
      debugError('[AuthContext] ERROR al obtener rol.', error);
      return null;
    }
    
    if (!data) {
      debugLog('[AuthContext] No se encontró perfil para UID (data es null):', uid);
      return null;
    }

    const loadedRole = (data as any).rol as Role;
    debugLog('[AuthContext] Rol cargado correctamente:', loadedRole);
    roleCache.set(uid, loadedRole);
    return loadedRole;
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      debugLog('[AuthContext] Iniciando validación de sesión...');
      const { data, error } = await supabase.auth.getSession();
      debugLog('[AuthContext] getSession result:', { data, error });

      if (error || !active) {
        if (error) debugError('[AuthContext] Error en getSession.', error);
        setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
        initialLoadDone.current = true;
        return;
      }

      const session = data.session;

      if (!session?.user) {
        debugLog('[AuthContext] No hay usuario en la sesión.');
        setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
        initialLoadDone.current = true;
        return;
      }

      debugLog('[AuthContext] Sesión activa para:', {
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
      initialLoadDone.current = true;
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      debugLog('[AuthContext] onAuthStateChange event:', event);
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        initialLoadDone.current = false;
        roleCache.clear();
        debugLog('[AuthContext] Sesión cerrada. Caché de roles en memoria limpiado.');
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        // 1. Evitar consultas duplicadas si INITIAL_SESSION llega cuando la inicialización ya se completó
        if (event === 'INITIAL_SESSION' && initialLoadDone.current) {
          debugLog('[AuthContext] INITIAL_SESSION omitido: ya cargado por init().');
          return;
        }

        // 2. Solo recargar si es un inicio de sesión nuevo y el usuario ha cambiado
        if (event === 'SIGNED_IN' && initialLoadDone.current && currentUserRef.current?.id === session.user.id) {
          debugLog('[AuthContext] SIGNED_IN omitido: el usuario es el mismo.');
          return;
        }

        debugLog('[AuthContext] Procesando login detectado para:', session.user.id);
        const role = await fetchRole(session.user.id);
        if (!active) return;
        setState(prev => ({
          ...prev,
          user: session.user,
          role,
          loading: false,
        }));
        initialLoadDone.current = true;
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
