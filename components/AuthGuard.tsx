"use client";

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Role } from '@/hooks/useAuth';

export default function AuthGuard({ requiredRole }: { requiredRole?: Role }) {
  const { user, role, loading, isMounted } = useAuth();
  const router = useRouter();
  const startGuardRender = useRef(performance.now());

  useEffect(() => {
    // 1. Si no ha montado o está cargando, esperamos
    if (!isMounted || loading) return;

    const endGuardCheck = performance.now();
    console.log(`[PERF_AUTH] Tiempo desde inicio de carga de AuthGuard hasta validación lista: ${(endGuardCheck - startGuardRender.current).toFixed(2)}ms. Usuario: ${user?.email}, Rol: ${role}`);

    // 2. Si NO hay usuario autenticado
    if (!user) {
      router.replace('/login');
      return;
    }

    // 3. Si hay usuario pero no tiene rol en la tabla 'Usuario'
    if (user && !role) {
      console.error('Acceso denegado: Usuario sin perfil en la base de datos.');
      router.replace('/login?error=no_role');
      return;
    }

    // 4. Protección por Rol Específico
    if (requiredRole && role !== requiredRole) {
      if (role === 'admin') router.replace('/admin');
      else if (role === 'cajera') router.replace('/cajera');
      else router.replace('/login');
    }
  }, [user, role, loading, isMounted, requiredRole, router]);

  // No bloqueamos el DOM. Solo mostramos la barrita de progreso
  if (loading || !isMounted) {
    return (
      <div className="fixed top-0 left-0 w-full h-1 z-[9999] bg-blue-500/20 overflow-hidden">
        <div className="h-full bg-blue-600 animate-pulse w-1/2 translate-x-1/2"></div>
      </div>
    );
  }

  return null;
}
