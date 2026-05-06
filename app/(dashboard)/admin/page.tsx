"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface DashboardStats {
  totalProductos: number;
  valorInventario: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProductos: 0,
    valorInventario: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Consultar productos usando Supabase
        const { data, error } = await supabase
          .from('Producto')
          .select('stock, precio_compra');

        if (error) throw error;

        // Calcular estadísticas
        const totalProductos = data ? data.length : 0;
        const valorInventario = data 
          ? data.reduce((acc, curr) => acc + (curr.stock * curr.precio_compra), 0) 
          : 0;

        setStats({
          totalProductos,
          valorInventario
        });
      } catch (error) {
        console.error('Error al cargar estadísticas desde Supabase:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">Panel de Administrador</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Bienvenido al panel principal. Los siguientes datos se extraen en tiempo real de tu base de datos en Supabase.
      </p>

      {/* Tarjetas de Estadísticas (Conectadas a Supabase) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total de Productos Registrados</h3>
          {loading ? (
             <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded mt-2 animate-pulse"></div>
          ) : (
            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-2">
              {stats.totalProductos}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Valor Total del Inventario</h3>
          {loading ? (
             <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded mt-2 animate-pulse"></div>
          ) : (
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              ${stats.valorInventario.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
