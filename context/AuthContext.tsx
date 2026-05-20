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

const roleCache = new Map<string, Role>();

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicialización optimista: Si tenemos el rol guardado, hidratamos instantáneamente
  const getInitialRole = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pos_cached_role') as Role | null;
    }
    return null;
  };

  const [state, setState] = useState<AuthState>({
    user: null,
    role: getInitialRole(),
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
    const startCacheCheck = performance.now();
    if (roleCache.has(uid)) {
      const cachedRole = roleCache.get(uid)!;
      const endCacheCheck = performance.now();
      console.log(`[PERF_AUTH] [Caché_Rol] Hit exitoso para UID: ${uid} en ${(endCacheCheck - startCacheCheck).toFixed(2)}ms. Rol: ${cachedRole}`);
      return cachedRole;
    }

    const startFetch = performance.now();
    debugLog('[AuthContext] Verificando rol para UID:', uid);
    
    const { data, error } = await supabase
      .from('Usuario')
      .select('rol')
      .eq('id', uid)
      .single();
    const endFetch = performance.now();
    console.log(`[PERF_AUTH] Consulta de rol a base de datos (fetchRole): ${(endFetch - startFetch).toFixed(2)}ms`);

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
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_cached_role', loadedRole);
    }
    
    return loadedRole;
  };

  useEffect(() => {
    let active = true;

    // Si Supabase no está configurado, omitimos consultas y liberamos el estado inmediatamente para no colgar la aplicación
    if (!isSupabaseConfigured) {
      debugError('[AuthContext] Supabase no está configurado en Vercel o entorno local. Desactivando flujo para evitar pantallas en blanco.');
      setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
      initialLoadDone.current = true;
      return;
    }

    const init = async () => {
      try {
        const startGetSession = performance.now();
        debugLog('[AuthContext] Iniciando validación de sesión...');
        const { data, error } = await supabase.auth.getSession();
        const endGetSession = performance.now();
        console.log(`[PERF_AUTH] Tiempo de getSession en AuthContext: ${(endGetSession - startGetSession).toFixed(2)}ms`);
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

        const startInitRole = performance.now();
        const fetchedRole = await fetchRole(session.user.id);
        const endInitRole = performance.now();
        console.log(`[PERF_WATERFALL] Tiempo de obtención del rol en AuthContext: ${(endInitRole - startInitRole).toFixed(2)}ms`);

        if (!active) return;
        setState({
          user: session.user,
          role: fetchedRole,
          loading: false,
          isMounted: true,
        });
        initialLoadDone.current = true;
      } catch (err: any) {
        debugError('[AuthContext] Excepción crítica atrapada en init(). Evitando pantalla en blanco.', err);
        if (active) {
          setState(prev => ({ ...prev, user: null, role: null, loading: false, isMounted: true }));
          initialLoadDone.current = true;
        }
      }
    };

    init();

    let subscription: any = null;
    try {
      const res = supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          debugLog('[AuthContext] onAuthStateChange event:', event);
          if (!active) return;

          if (event === 'SIGNED_OUT') {
            initialLoadDone.current = false;
            roleCache.clear();
            if (typeof window !== 'undefined') {
              localStorage.removeItem('pos_cached_role');
            }
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
        } catch (innerErr) {
          debugError('[AuthContext] Error en onAuthStateChange listener callback:', innerErr);
        }
      });
      subscription = res.data?.subscription;
    } catch (subErr) {
      debugError('[AuthContext] Fallo al suscribir a onAuthStateChange:', subErr);
    }

    return () => {
      active = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}
