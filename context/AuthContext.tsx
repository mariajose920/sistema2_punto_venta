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
const CACHED_ROLE_KEY = 'pos_cached_role_entry';

type CachedRoleEntry = {
  uid: string;
  role: Role;
};

const getCachedRoleEntry = (uid?: string): CachedRoleEntry | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHED_ROLE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedRoleEntry;
    if (uid && parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveCachedRoleEntry = (uid: string, role: Role) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CACHED_ROLE_KEY, JSON.stringify({ uid, role }));
};

const clearCachedRoleEntry = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHED_ROLE_KEY);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const getInitialRole = () => {
    if (typeof window === 'undefined') return null;
    return getCachedRoleEntry()?.role ?? null;
  };

  const [state, setState] = useState<AuthState>({
    user: null,
    role: getInitialRole(),
    loading: true,
    isMounted: false,
  });

  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    currentUserRef.current = state.user;
  }, [state.user]);

  const fetchRole = async (uid: string): Promise<Role | null> => {
    const cacheStart = performance.now();
    const cachedRoleEntry = getCachedRoleEntry(uid);

    if (cachedRoleEntry) {
      roleCache.set(uid, cachedRoleEntry.role);
      console.log('[AUTH_TRACE] role_cache_hit', {
        uid,
        role: cachedRoleEntry.role,
        ms: Number((performance.now() - cacheStart).toFixed(2)),
      });
      return cachedRoleEntry.role;
    }

    if (roleCache.has(uid)) {
      console.log('[AUTH_TRACE] role_memory_hit', {
        uid,
        role: roleCache.get(uid),
        ms: Number((performance.now() - cacheStart).toFixed(2)),
      });
      return roleCache.get(uid)!;
    }

    const fetchStart = performance.now();
    debugLog('[AuthContext] Verificando rol para UID:', uid);

    const { data, error } = await supabase
      .from('Usuario')
      .select('rol')
      .eq('id', uid)
      .single();

    console.log('[AUTH_TRACE] role_query_authcontext', {
      uid,
      ms: Number((performance.now() - fetchStart).toFixed(2)),
      hasError: Boolean(error),
      errorMessage: error?.message ?? null,
      role: (data as { rol?: Role } | null)?.rol ?? null,
    });

    if (error) {
      debugError('[AuthContext] ERROR al obtener rol.', error);
      return null;
    }

    if (!data) {
      debugLog('[AuthContext] No se encontró perfil para UID (data es null):', uid);
      return null;
    }

    const loadedRole = (data as { rol: Role }).rol;
    roleCache.set(uid, loadedRole);
    saveCachedRoleEntry(uid, loadedRole);
    debugLog('[AuthContext] Rol cargado correctamente:', loadedRole);

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
        const sessionStart = performance.now();
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('[AUTH_TRACE] getSession', {
          ms: Number((performance.now() - sessionStart).toFixed(2)),
          hasError: Boolean(error),
          errorMessage: error?.message ?? null,
          hasUser: Boolean(session?.user),
          userId: session?.user?.id ?? null,
        });

        if (error || !session?.user) {
          if (active) {
            setState(prev => ({ ...prev, user: null, loading: false }));
          }
          return;
        }

        const cachedRoleEntry = getCachedRoleEntry(session.user.id);
        if (cachedRoleEntry) {
          roleCache.set(session.user.id, cachedRoleEntry.role);
          if (active) {
            setState(prev => ({
              ...prev,
              user: session.user,
              role: cachedRoleEntry.role,
              loading: false,
            }));
          }
          return;
        }

        const roleStart = performance.now();
        const fetchedRole = await fetchRole(session.user.id);
        console.log('[AUTH_TRACE] role_bootstrap_after_getSession', {
          uid: session.user.id,
          role: fetchedRole,
          ms: Number((performance.now() - roleStart).toFixed(2)),
        });

        if (active) {
          setState(prev => ({
            ...prev,
            user: session.user,
            role: fetchedRole,
            loading: false,
          }));
        }
      } catch (err) {
        debugError('[AuthContext] Error en loadSession:', err);
        if (active) {
          setState(prev => ({ ...prev, user: null, loading: false }));
        }
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        roleCache.clear();
        clearCachedRoleEntry();
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        if (currentUserRef.current?.id === session.user.id) {
          return;
        }

        const cachedRoleEntry = getCachedRoleEntry(session.user.id);
        if (cachedRoleEntry) {
          roleCache.set(session.user.id, cachedRoleEntry.role);
          setState(prev => ({
            ...prev,
            user: session.user,
            role: cachedRoleEntry.role,
            loading: false,
          }));
          return;
        }

        const fetchedRole = await fetchRole(session.user.id);
        if (active) {
          setState(prev => ({
            ...prev,
            user: session.user,
            role: fetchedRole,
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
