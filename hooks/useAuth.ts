"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

// Definimos los roles posibles en el sistema, basados en los requisitos
export type Role = 'admin' | 'cajera' | null;

interface AuthState {
  user: User | null;
  role: Role;
  loading: boolean;
}

/**
 * Hook personalizado para manejar la autenticación y los roles del usuario.
 * Obtiene la sesión actual desde Supabase auth y consulta la tabla 'Usuario'
 * para determinar el rol del usuario conectado.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  // El estado 'loading' evita que se realicen redirecciones prematuras mientras se consulta
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Función asíncrona para obtener la sesión actual y el rol del usuario de la base de datos
    const fetchSessionAndRole = async () => {
      try {
        setLoading(true);
        // 1. Obtenemos la sesión actual de Supabase Auth
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (session?.user) {
          setUser(session.user);
          
          // 2. Consultamos la tabla 'Usuario' para obtener el rol.
          // Comparamos el ID de auth.users con la columna 'id' de la tabla 'Usuario'
          const { data: usuarioData, error: roleError } = await supabase
            .from('Usuario')
            .select('rol')
            .eq('id', session.user.id)
            .single();

          if (roleError) {
            console.error('Error al obtener el rol del usuario desde la tabla Usuario:', roleError);
            setRole(null);
          } else if (usuarioData) {
            // Asignamos el rol obtenido (debe ser 'admin' o 'cajera')
            setRole(usuarioData.rol as Role);
          }
        } else {
          setUser(null);
          setRole(null);
        }
      } catch (error) {
        console.error('Error inesperado en la autenticación:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSessionAndRole();

    // 3. Nos suscribimos a los cambios de estado de autenticación (ej. cuando el usuario hace login o logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          // Al cambiar la sesión (ej. tras un login), volvemos a consultar el rol
          const { data: usuarioData } = await supabase
            .from('Usuario')
            .select('rol')
            .eq('id', session.user.id)
            .single();
            
          setRole(usuarioData?.rol as Role);
        } else {
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    // Limpiamos la suscripción de Supabase al desmontar el componente para evitar fugas de memoria
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, role, loading };
}
