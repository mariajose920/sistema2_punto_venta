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
    setState(s => ({ ...s, isMounted: true }));

    if (!isSupabaseConfigured) {
      debugError('[AuthContext] Supabase no configurado.');
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    const loadSession = async () => {
      try {
        const startGetSession = performance.now();
        const { data: { session }, error } = await supabase.auth.getSession();
        const endGetSession = performance.now();
        console.log(`[PERF_WATERFALL] getSession completado en ${(endGetSession - startGetSession).toFixed(2)}ms`);

        if (error || !session?.user) {
          if (active) setState(prev => ({ ...prev, user: null, loading: false }));
          return;
        }

        const startInitRole = performance.now();
        const fetchedRole = await fetchRole(session.user.id);
        const endInitRole = performance.now();
        console.log(`[PERF_WATERFALL] fetchRole completado en ${(endInitRole - startInitRole).toFixed(2)}ms`);

        if (active) {
          setState(prev => ({ ...prev, user: session.user, role: fetchedRole, loading: false }));
        }
      } catch (err) {
        debugError('[AuthContext] Error en loadSession:', err);
        if (active) setState(prev => ({ ...prev, user: null, loading: false }));
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      
      // IGNORAMOS INITIAL_SESSION porque ya lo manejamos con getSession() arriba.
      // Esto evita el doble fetch de rol al inicio.
      
      if (event === 'SIGNED_OUT') {
        roleCache.clear();
        if (typeof window !== 'undefined') localStorage.removeItem('pos_cached_role');
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
      } else if (event === 'SIGNED_IN' && session?.user) {
        // Evitamos refetch si el usuario es el mismo que ya cargamos
        if (currentUserRef.current?.id === session.user.id) return;
        
        const fetchedRole = await fetchRole(session.user.id);
        if (active) {
          setState(prev => ({ ...prev, user: session.user, role: fetchedRole, loading: false }));
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
