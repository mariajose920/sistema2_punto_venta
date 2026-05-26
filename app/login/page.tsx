"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, getUserRole } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

type CachedRoleEntry = {
  uid: string;
  role: string;
};

const CACHED_ROLE_KEY = 'pos_cached_role_entry';

const getCachedRoleEntry = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHED_ROLE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedRoleEntry;
  } catch {
    return null;
  }
};

const saveCachedRoleEntry = (uid: string, role: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CACHED_ROLE_KEY, JSON.stringify({ uid, role }));
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && role) {
      router.push(role === 'admin' ? '/admin' : '/cajera');
    }
  }, [user, role, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'no_role') {
      setTimeout(() => {
        setError('⚠️ Acceso restringido: Tu cuenta es válida, pero no tienes un perfil operativo asignado. Contacta al administrador para que te asigne un rol.');
      }, 0);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const loginStart = performance.now();

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      const authStart = performance.now();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      const authElapsed = performance.now() - authStart;
      console.log('[LOGIN_TRACE] signInWithPassword', {
        ms: Number(authElapsed.toFixed(2)),
        hasError: Boolean(authError),
        errorMessage: authError?.message ?? null,
        userId: authData?.user?.id ?? null,
      });

      if (authError) {
        const isNetwork =
          authError.message === 'Failed to fetch' ||
          authError.message === 'NetworkError' ||
          authError.message?.toLowerCase().includes('network') ||
          authError.message?.toLowerCase().includes('fetch') ||
          authError.message?.toLowerCase().includes('could not connect');

        if (isNetwork) {
          console.error('[AuthNetworkError] Fallo de conexión al iniciar sesión:', authError);
          throw new Error('No se pudo conectar con el servidor de autenticación. Verifica tu conexión a internet.');
        }

        console.error('[AuthCredentialError] Credenciales rechazadas:', authError);
        throw new Error('Acceso denegado: Credenciales inválidas. Revisa tu correo y contraseña.');
      }

      if (!authData?.user?.id) {
        throw new Error('No se pudo recuperar el usuario autenticado.');
      }

      // Redundant role fetching removed. AuthContext handles role retrieval and navigation via its onAuthStateChange listener.
// The useEffect at lines 40-44 will redirect once user and role are populated.

    } catch (err: any) {
      const errMsg = err?.message ?? 'unknown';
      console.log('[LOGIN_TRACE] login_error', {
        ms: Number((performance.now() - loginStart).toFixed(2)),
        message: errMsg,
      });
      console.error('[LoginProcessError]', err);

      const isNetwork =
        errMsg === 'Failed to fetch' ||
        errMsg === 'NetworkError' ||
        errMsg?.toLowerCase().includes('network') ||
        errMsg?.toLowerCase().includes('fetch') ||
        errMsg?.toLowerCase().includes('could not connect') ||
        err?.name === 'TypeError';

      setError(
        isNetwork
          ? 'No se pudo conectar con el servidor de autenticación. Verifica tu conexión a internet.'
          : errMsg || 'Error crítico en el proceso de autenticación.'
      );
      setLoading(false);
    }
  };

  if (authLoading || (user && role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 px-3 sm:px-4 py-6 sm:py-8">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
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

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 sm:p-4 mb-6 rounded" role="alert">
              <p className="text-xs sm:text-sm text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
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

          <div className="mt-6 sm:mt-8">
            <div className="relative mb-6 sm:mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 sm:px-4 bg-white dark:bg-gray-800 text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">Para Clientes</span>
              </div>
            </div>

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

        <div className="hidden sm:block text-center mt-6 text-xs text-gray-500 dark:text-gray-400">
          <p>© 2024 POSMASTER. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}
