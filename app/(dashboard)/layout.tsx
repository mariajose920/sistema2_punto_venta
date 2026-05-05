"use client";

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import AuthGuard from '@/components/AuthGuard';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = useAuth();
  const router = useRouter();

  // Función para cerrar sesión
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    // Protegemos todo el layout del dashboard. Si no hay sesión, AuthGuard redirige al login.
    <AuthGuard>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        
        {/* Barra lateral (Sidebar) compartida */}
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">Mi POS</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Rol: <span className="font-semibold capitalize ml-1">{role}</span>
            </p>
          </div>
          
          <nav className="flex-1 p-4 space-y-1">
            {/* Rutas compartidas (acceso para ambos roles) */}
            <Link 
              href={role === 'admin' ? '/admin' : '/cajera'} 
              className="block px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              Dashboard Principal
            </Link>
            
            <Link 
              href="/productos" 
              className="block px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              Catálogo de Productos
            </Link>

            {/* Lógica de renderizado condicional según el rol */}
            
            {/* Opciones exclusivas para ADMINISTRADOR */}
            {role === 'admin' && (
              <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Administración
                </p>
                <Link 
                  href="/usuarios" 
                  className="block px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                >
                  Gestión de Usuarios
                </Link>
                <Link 
                  href="/precios-compra" 
                  className="block px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                >
                  Precios de Compra
                </Link>
              </div>
            )}

            {/* Opciones exclusivas para CAJERA */}
            {role === 'cajera' && (
              <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Operaciones
                </p>
                <Link 
                  href="/ventas/nueva" 
                  className="block px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                >
                  Nueva Venta (TPV)
                </Link>
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
              </svg>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Área de contenido principal (donde se renderizan las páginas específicas) */}
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>

      </div>
    </AuthGuard>
  );
}
