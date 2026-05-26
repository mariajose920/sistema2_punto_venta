"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Role } from '@/hooks/useAuth';

export default function AuthGuard({ requiredRole }: { requiredRole?: Role }) {
  const { user, role, loading, isMounted } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isMounted || loading) return;

    if (!user) {
      router.replace('/login');
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
