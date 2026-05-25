"use client";

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Role } from '@/hooks/useAuth';

export default function AuthGuard({ requiredRole }: { requiredRole?: Role }) {
  const { user, role, loading, isMounted } = useAuth();
  const router = useRouter();
  const startGuardRender = useRef(performance.now());

  useEffect(() => {
    if (!isMounted || loading) return;

    const elapsedMs = performance.now() - startGuardRender.current;
    console.log('[AUTH_GUARD_TRACE] guard_ready', {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      hasUser: Boolean(user),
      hasRole: Boolean(role),
      role,
    });

    if (!user) {
      console.log('[AUTH_GUARD_TRACE] redirect_to_login', {
        elapsedMs: Number(elapsedMs.toFixed(2)),
      });
      router.replace('/login');
      return;
    }

    if (user && !role) {
      console.log('[AUTH_GUARD_TRACE] role_pending', {
        elapsedMs: Number(elapsedMs.toFixed(2)),
        email: user.email,
      });
      return;
    }

    if (requiredRole && role !== requiredRole) {
      if (role === 'admin') {
        router.replace('/admin');
      } else if (role === 'cajera') {
        router.replace('/cajera');
      } else {
        router.replace('/login');
      }
    }
  }, [user, role, loading, isMounted, requiredRole, router]);

  return null;
}
