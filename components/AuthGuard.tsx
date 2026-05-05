"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Role } from '@/hooks/useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * Rol requerido para acceder a la ruta que este componente envuelve.
   * Si no se proporciona, solo verificará que exista una sesión válida (usuario logueado).
   */
  requiredRole?: Role;
}

/**
 * Componente AuthGuard que protege las rutas de la aplicación.
 * Redirige al usuario al /login si no está autenticado.
 * Redirige a su dashboard correspondiente si el rol no coincide con el `requiredRole`.
 */
export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Si aún estamos comprobando la sesión o el rol, esperamos (no hacemos redirecciones aún)
    if (loading) return;

    // Si no hay un usuario autenticado, redirigimos inmediatamente a la página de inicio de sesión
    if (!user) {
      router.push('/login');
      return;
    }

    // Si se requiere un rol específico y el usuario tiene un rol distinto
    if (requiredRole && role !== requiredRole) {
      // Redirigimos al usuario a la página principal correspondiente a su rol actual
      if (role === 'admin') {
        router.push('/admin');
      } else if (role === 'cajera') {
        router.push('/cajera');
      } else {
        // Si el usuario tiene un rol inválido o nulo, por seguridad lo enviamos al login
        router.push('/login');
      }
    }
  }, [user, role, loading, requiredRole, router]);

  // Mientras se carga la información de autenticación, mostramos una pantalla de carga.
  // Esto evita que se renderice contenido protegido por unos milisegundos (parpadeo).
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-xl font-medium text-gray-500">Verificando sesión...</p>
      </div>
    );
  }

  // Si no hay usuario o si el rol no coincide (y la validación ya terminó), 
  // no renderizamos los hijos (children). El useEffect anterior se encargará de redirigir.
  if (!user || (requiredRole && role !== requiredRole)) {
    return null;
  }

  // Si el usuario está autenticado y tiene el rol correcto, mostramos el contenido protegido
  return <>{children}</>;
}
