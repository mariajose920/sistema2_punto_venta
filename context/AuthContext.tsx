"use client";

import React, { createContext, useEffect, useState, ReactNode, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, getUserRole } from '@/lib/supabase';
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('[PERF][PROFILE] role_memory_hit', {
          uid,
          role: roleCache.get(uid),
          ms: Number((performance.now() - cacheStart).toFixed(2)),
        });
      }
      return roleCache.get(uid)!;
    }

    const fetchStart = performance.now();
    debugLog('[AuthContext] Verificando rol para UID:', uid);

    try {
      const rolePromise = getUserRole(uid);
      const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_ERROR')), 8000));
      const loadedRole = await Promise.race([rolePromise, timeoutPromise]) as Role | null;

      if (process.env.NODE_ENV !== 'production') {
        console.log('[PERF][PROFILE] role_query_authcontext', {
          uid,
          ms: Number((performance.now() - fetchStart).toFixed(2)),
          role: loadedRole,
        });
      }

      if (!loadedRole) {
        debugError('[AuthContext] No se encontró perfil para UID:', uid);
        return null;
      }

      roleCache.set(uid, loadedRole);
      saveCachedRoleEntry(uid, loadedRole);
      debugLog('[AuthContext] Rol cargado correctamente:', loadedRole);

      return loadedRole;
    } catch (err: any) {
      console.error('[AuthContext] Error fetching role:', err);
      return null;
    }
  };

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
        if (process.env.NODE_ENV !== 'production') {
          console.log('[PERF][PROFILE] role_bootstrap_after_getSession', {
            uid: session.user.id,
            role: fetchedRole,
            ms: Number((performance.now() - roleStart).toFixed(2)),
          });
        }

        if (!fetchedRole) {
          await supabase.auth.signOut();
          if (active) {
            setState(prev => ({ ...prev, user: null, role: null, loading: false }));
            if (window.location.pathname === '/login') {
              window.history.replaceState({}, '', '/login?error=no_role');
              // Disparar evento para que el componente login detecte el error
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
            role: fetchedRole,
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
        roleCache.clear();
        clearCachedRoleEntry();
        setState(prev => ({ ...prev, user: null, role: null, loading: false }));
        return;
      }

      if (session?.user) {
        if (currentUserRef.current?.id === session.user.id) {
          return;
        }
        currentUserRef.current = session.user;

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

        const roleStart = performance.now();
        const fetchedRole = await fetchRole(session.user.id);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log('[PERF][PROFILE] role_bootstrap_after_onAuthStateChange', {
            uid: session.user.id,
            role: fetchedRole,
            ms: Number((performance.now() - roleStart).toFixed(2)),
          });
        }

        if (!fetchedRole) {
          await supabase.auth.signOut();
          if (active) {
            setState(prev => ({ ...prev, user: null, role: null, loading: false }));
            if (window.location.pathname === '/login') {
              window.history.replaceState({}, '', '/login?error=no_role');
              // Workaround to trigger re-render on the login page params logic
              window.dispatchEvent(new Event('popstate'));
              // Fallback to reload if popstate doesn't work for query params in next
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
