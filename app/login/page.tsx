"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, role } = useAuth();

  // 1. Auto-redirección si el usuario ya está autenticado y tiene un rol asignado
  useEffect(() => {
    if (user && role) {
      router.push(role === 'admin' ? '/admin' : '/cajera');
    }
  }, [user, role, router]);

  // 2. Capturar errores de redirección de seguridad (por ejemplo, usuario sin rol en AuthGuard)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'no_role') {
        setError('⚠️ Acceso restringido: Tu cuenta es válida, pero no tienes un perfil operativo asignado. Contacta al administrador para que te asigne un rol.');
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      // 1. Autenticación directa en Supabase Auth
      const startAuth = performance.now();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      const endAuth = performance.now();
      console.log(`[PERF_AUTH] Tiempo de signInWithPassword: ${(endAuth - startAuth).toFixed(2)}ms`);

      if (authError) throw new Error(`ACCESO DENEGADO: ${authError.message}`);
      if (!authData?.user?.id) throw new Error('No se pudo recuperar el usuario autenticado.');

      // 🔥 REFACTOR DE RENDIMIENTO: Evitamos depender del onAuthStateChange para el primer render
      // Obtenemos el rol Inmediatamente en paralelo o justo después del login
      const startRole = performance.now();
      const { data: roleData, error: roleError } = await supabase
        .from('Usuario')
        .select('rol')
        .eq('id', authData.user.id)
        .single();
      const endRole = performance.now();
      console.log(`[PERF_AUTH] Tiempo de fetchRole en Login: ${(endRole - startRole).toFixed(2)}ms`);

      if (roleError) {
        console.error('Error al obtener rol:', roleError);
      }

      const userRole = (roleData as any)?.rol;
      
      if (!userRole) {
        throw new Error('Usuario sin perfil en la base de datos.');
      }

      // Redirección imperativa inmediata (bypass al useEffect de React)
      const redirectStart = performance.now();
      console.log(`[PERF_AUTH] Iniciando redirección a dashboard: ${redirectStart}ms`);
      
      if (userRole === 'admin') {
        router.push('/admin');
      } else {
        router.push('/cajera');
      }

    } catch (err: any) {
      setError(err.message || 'Error crítico en el proceso de autenticación.');
      console.error('[LoginProcessError]', err);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 px-3 sm:px-4 py-6 sm:py-8">
      <div className="w-full max-w-md">
        {/* Card Principal */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
          {/* Logo y Branding */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center text-white font-black text-2xl sm:text-3xl mx-auto mb-4 shadow-lg">
              P
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              POS<span className="text-blue-600">MASTER</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-2">
              Sistema de Punto de Venta
            </p>
          </div>
          
          {/* Mensaje de Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 sm:p-4 mb-6 rounded" role="alert">
              <p className="text-xs sm:text-sm text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Formulario de Login */}
          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
            {/* Email */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2" htmlFor="email">
                Correo Electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 dark:text-white text-sm sm:text-base transition-all"
                placeholder="admin@empresa.com"
                required
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 dark:text-white text-sm sm:text-base transition-all"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {/* Botón Login */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 sm:py-3 px-4 rounded-lg text-white font-bold transition-all duration-200 shadow-md text-sm sm:text-base
                ${loading 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Ingresando...
                </span>
              ) : (
                'Entrar al Sistema'
              )}
            </button>
          </form>

          {/* Divisor */}
          <div className="mt-6 sm:mt-8">
            <div className="relative mb-6 sm:mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 sm:px-4 bg-white dark:bg-gray-800 text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">Para Clientes</span>
              </div>
            </div>
            
            {/* Botón Catálogo */}
            <button
              type="button"
              onClick={() => router.push('/catalogo')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all duration-200 border border-emerald-200 dark:border-emerald-800 shadow-sm text-sm sm:text-base active:scale-95 disabled:opacity-50"
            >
              <span className="text-lg sm:text-xl">🛍️</span>
              Ver Catálogo Público
            </button>
            <p className="mt-2 text-xs text-gray-400 text-center">Sin requerir inicio de sesión</p>
          </div>
        </div>

        {/* Footer Info - Solo Desktop */}
        <div className="hidden sm:block text-center mt-6 text-xs text-gray-500 dark:text-gray-400">
          <p>© 2024 POSMASTER. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}
