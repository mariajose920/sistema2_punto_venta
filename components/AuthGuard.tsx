"use client";

import { useEffect, useRef } from 'react';
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

  // REFACTOR PERF: En lugar de hacer 'return <Spinner />' (lo cual desmonta el árbol y crea un Waterfall),
  // renderizamos el children SIEMPRE, pero le ponemos un Overlay encima si está cargando.
  // Esto permite que React reciba el HTML del SSR, lo parsee, descargue imágenes y prepare el DOM en paralelo.
  
  if (!isMounted || (!user && !loading && !role)) {
    // Si definitivamente no hay auth tras cargar, no renderizar layout privado (evita FOUC)
    return null;
  }

  const isGuarding = loading || (!user && isMounted);

  return (
    <>
      {isGuarding && (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-md">
          <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-3"></div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">
            Validando Accesos
          </p>
        </div>
      )}
      
      {/* El dashboard se monta en el DOM pero se oculta visualmente (o se envía atrás) hasta que termine la validación */}
      <div className={isGuarding ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100 transition-opacity duration-300'}>
        {children}
      </div>
    </>
  );

}
