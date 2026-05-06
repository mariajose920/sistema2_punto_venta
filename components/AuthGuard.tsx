"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Role } from '@/hooks/useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * Rol requerido para acceder a la ruta. 
   * Si es null, solo requiere estar logueado.
   */
  requiredRole?: Role;
}

/**
 * AuthGuard: Protector de rutas de alta seguridad.
 * Gestiona redirecciones automáticas, protección por roles y estados de carga.
 */
export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { user, role, loading, isMounted } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 1. Si no ha montado o está cargando, esperamos
    if (!isMounted || loading) return;

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

  // Pantalla de Carga Premium (Previene parpadeos de contenido protegido)
  if (!isMounted || loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-gray-950">
        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">
          Autenticando Acceso
        </p>
      </div>
    );
  }

  // Prevención de renderizado accidental
  if (!user || !role || (requiredRole && role !== requiredRole)) {
    return null;
  }

  return <>{children}</>;
}
