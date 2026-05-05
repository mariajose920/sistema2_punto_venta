"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Iniciamos sesión con correo y contraseña en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // Manejamos el error de credenciales incorrectas u otros problemas de autenticación
        // Se arroja el error para ser capturado en el bloque catch
        throw new Error('Credenciales inválidas. Por favor verifica tu correo y contraseña.');
      }

      if (authData.user) {
        // 2. Una vez autenticado, consultamos el rol del usuario en nuestra tabla 'Usuario'
        const { data: usuarioData, error: roleError } = await supabase
          .from('Usuario')
          .select('rol')
          .eq('id', authData.user.id)
          .single();

        if (roleError || !usuarioData) {
          // Manejamos el caso donde el usuario existe en Auth pero no tiene su rol configurado en la tabla
          throw new Error('No se pudo verificar el rol del usuario. Contacta al administrador.');
        }

        // 3. Lógica de redirección basada en el rol obtenido de la base de datos
        const userRole = usuarioData.rol;
        if (userRole === 'admin') {
          // Redirigimos al panel de administrador si es admin
          router.push('/admin');
        } else if (userRole === 'cajera') {
          // Redirigimos al panel de la cajera si tiene ese rol
          router.push('/cajera');
        } else {
          // Error en caso de roles no contemplados
          throw new Error('Rol de usuario no reconocido en el sistema.');
        }
      }
    } catch (err: unknown) {
      // Capturamos cualquier error (ya sea de Supabase Auth o de nuestra propia validación)
      // y lo establecemos en el estado para mostrarlo en la interfaz gráfica
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado al intentar iniciar sesión.');
      console.error('Error en handleLogin:', err);
    } finally {
      // Finalizamos el estado de carga, independientemente del éxito o error
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            Sistema POS
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Ingresa tus credenciales para acceder
          </p>
        </div>
        
        {/* Renderizado condicional del mensaje de error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-6" role="alert">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="email">
              Correo Electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 transition-colors"
              placeholder="admin@empresa.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg text-white font-semibold transition-all duration-200 shadow-sm
              ${loading 
                ? 'bg-blue-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
              }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Iniciando sesión...
              </span>
            ) : (
              'Entrar al Sistema'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
