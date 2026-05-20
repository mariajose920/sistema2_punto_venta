"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

interface Compra {
  id_compra: string;
  total_compra: number;
  fecha_compra: string;
  Proveedor: {
    nombre_empresa: string;
  } | null;
}

export default function ComprasPage() {
  const { role } = useAuth();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCompras = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('Compra')
        .select('id_compra, total_compra, fecha_compra, Proveedor(nombre_empresa)')
        .order('fecha_compra', { ascending: false });

      if (error) throw error;
      setCompras(data || []);
    } catch (err) {
      console.error('Error cargando compras:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'admin') fetchCompras();
  }, [role, fetchCompras]);

  if (role !== 'admin') {
    return <div className="p-12 text-center font-bold text-red-500">Acceso Restringido: Solo el administrador puede gestionar compras.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Gestión de Compras</h1>
          <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Abastecimiento y Costos</p>
        </div>
        <Link 
          href="/compras/nueva"
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-emerald-100 dark:shadow-none transition-all transform active:scale-95 flex items-center gap-2"
        >
          <span>📦</span> Registrar Nueva Compra
        </Link>
      </div>

      {/* Historial de Compras */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-50 dark:border-gray-700">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Historial Reciente</h2>
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">Fecha</th>
                <th className="px-8 py-5">Proveedor</th>
                <th className="px-8 py-5 text-right">Monto Total</th>
                <th className="px-8 py-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={4} className="p-12 text-center text-gray-400 font-bold animate-pulse">Cargando historial...</td></tr>
              ) : compras.length === 0 ? (
                <tr><td colSpan={4} className="p-12 text-center text-gray-400 italic">No hay compras registradas.</td></tr>
              ) : compras.map(compra => (
                <tr key={compra.id_compra} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                  <td className="px-8 py-6 font-bold text-gray-900 dark:text-white">
                    {new Date(compra.fecha_compra).toLocaleDateString()}
                    <p className="text-[10px] text-gray-400 font-black">{new Date(compra.fecha_compra).toLocaleTimeString()}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className="font-black text-emerald-600 uppercase text-xs tracking-tighter">
                      {compra.Proveedor?.nombre_empresa || 'Proveedor Desconocido'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className="font-black text-gray-900 dark:text-white text-lg">
                      ${compra.total_compra.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Ver Detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-4">
          {loading ? (
            <div className="p-8 text-center text-gray-400 font-bold animate-pulse">Cargando historial...</div>
          ) : compras.length === 0 ? (
            <div className="p-8 text-center text-gray-400 italic">No hay compras registradas.</div>
          ) : compras.map(compra => (
            <div key={compra.id_compra} className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {new Date(compra.fecha_compra).toLocaleDateString()}
                  </p>
                  <p className="text-[10px] text-gray-400 font-black">
                    {new Date(compra.fecha_compra).toLocaleTimeString()}
                  </p>
                </div>
                <span className="font-black text-emerald-600 uppercase text-xs tracking-tighter">
                  {compra.Proveedor?.nombre_empresa || 'Proveedor Desconocido'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="font-black text-gray-900 dark:text-white text-lg">
                  ${compra.total_compra.toLocaleString()}
                </span>
                <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline py-2 px-3">Ver Detalle</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

