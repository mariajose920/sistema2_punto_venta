"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface ProductBrief {
  id: string;
  nombre: string;
  precio_venta_publico: number;
  stock_actual: number;
}

interface ClientCredit {
  id: string;
  nombre: string;
  saldo_deudado: number;
}

interface Promotion {
  id: string;
  nombre: string;
  tipo: string;
  valor: number;
}

export default function CajeraDashboardPage() {
  const { user, role, isMounted } = useAuth();
  const [productos, setProductos] = useState<ProductBrief[]>([]);
  const [clientesFiado, setClientesFiado] = useState<ClientCredit[]>([]);
  const [promociones, setPromociones] = useState<Promotion[]>([]);
  const [actividadReciente, setActividadReciente] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isMounted || !user) return;

    const fetchCajeraData = async () => {
      try {
        setLoading(true);
        
        const [
          { data: prods },
          { data: clients },
          { data: promos },
          { data: sales }
        ] = await Promise.all([
          supabase.from('Producto').select('id, nombre, precio_venta_publico, stock_actual').order('stock_actual', { ascending: false }).limit(6),
          supabase.from('Cliente').select('id, nombre, saldo_deudado').gt('saldo_deudado', 0).limit(4),
          supabase.from('Promocion').select('id, nombre, tipo, valor').eq('activa', true).limit(3),
          supabase.from('Venta').select('id_venta, total_venta, fecha_venta, forma_pago').eq('id_usuario_cajera', user.id).order('fecha_venta', { ascending: false }).limit(5)
        ]);

        setProductos(prods || []);
        setClientesFiado(clients || []);
        setPromociones(promos || []);
        setActividadReciente(sales || []);
      } catch (error) {
        console.error('Error cargando datos de cajera:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCajeraData();
  }, [user, isMounted]);

  if (!isMounted) {
    return null;
  }

  if (role !== 'cajera' && role !== 'admin') {
    return (
      <div className="p-12 text-center bg-red-50 rounded-3xl border border-red-100">
        <h2 className="text-2xl font-black text-red-600 uppercase italic">Acceso No Autorizado</h2>
        <p className="text-gray-500 font-bold mt-2">No tienes permisos para acceder a esta área operativa.</p>
        <Link href="/" className="mt-6 inline-block bg-red-600 text-white px-8 py-3 rounded-xl font-bold uppercase text-xs">Cerrar Sesión</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Bienvenida y Acciones Rápidas */}
      <header className="bg-white dark:bg-gray-900 p-4 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-xl border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6 lg:gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/5 rounded-full -ml-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10 text-center md:text-left w-full">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tighter mb-1 sm:mb-2 italic leading-tight break-words">Terminal de Caja</h1>
          <p className="text-gray-400 font-bold uppercase text-[10px] sm:text-xs tracking-[0.3em] break-words">Operador: {user?.email}</p>
        </div>
        
        <Link 
          href="/ventas/nueva" 
          className="relative z-10 bg-blue-600 hover:bg-blue-700 text-white px-6 sm:px-10 py-3 sm:py-5 rounded-[2rem] font-black text-base sm:text-xl shadow-2xl shadow-blue-200 dark:shadow-none transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto text-center"
        >
          <span>🛒</span> NUEVA VENTA (F1)
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Columna Principal: Inventario y Actividad */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Consulta Rápida de Inventario */}
          <section className="bg-white dark:bg-gray-800 rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-8 border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4 sm:mb-6">
              <h2 className="text-sm sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-3">
                <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
                Stock Disponible
              </h2>
              <Link href="/productos" className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full text-center">Ver Catálogo Completo</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={`producto-skeleton-${index}`} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl animate-pulse">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full w-3/4 mb-3"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-1/2 mb-4"></div>
                      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div>
                    </div>
                  ))
                : productos.map(p => (
                    <div key={p.id} className="group p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-transparent hover:border-blue-100 dark:hover:border-blue-900/30 transition-all flex flex-wrap justify-between items-center gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800 dark:text-white text-sm break-words">{p.nombre}</p>
                        <p className={`text-[10px] font-black uppercase ${p.stock_actual > 10 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {p.stock_actual} Unidades en stock
                        </p>
                      </div>
                      <p className="font-black text-gray-900 dark:text-white text-lg whitespace-nowrap">${p.precio_venta_publico.toLocaleString()}</p>
                    </div>
                  ))}
            </div>
          </section>

          {/* Registro de Actividad Personal */}
          <section className="bg-white dark:bg-gray-800 rounded-[2rem] sm:rounded-[2.5rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="p-4 sm:p-8 border-b border-gray-50 dark:border-gray-700">
              <h2 className="text-sm sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest">Mis Últimas Ventas</h2>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={`venta-skeleton-${index}`} className="px-4 sm:px-8 py-4 sm:py-6 animate-pulse flex gap-4">
                      <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full w-20"></div>
                      <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full w-24"></div>
                      <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full w-28 ml-auto"></div>
                    </div>
                  ))}
                </div>
              ) : actividadReciente.length > 0 ? (
                <table className="w-full text-left min-w-[320px]">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 sm:px-8 py-3 sm:py-5">Hora</th>
                      <th className="px-4 sm:px-8 py-3 sm:py-5">Tipo Pago</th>
                      <th className="px-4 sm:px-8 py-3 sm:py-5 text-right">Total Cobrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {actividadReciente.map(venta => (
                      <tr key={venta.id_venta} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                        <td className="px-4 sm:px-8 py-4 sm:py-6 font-bold text-gray-900 dark:text-white">
                          {new Date(venta.fecha_venta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 sm:px-8 py-4 sm:py-6">
                          <span className="text-[9px] font-black px-2 sm:px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 uppercase">
                            {venta.forma_pago}
                          </span>
                        </td>
                        <td className="px-4 sm:px-8 py-4 sm:py-6 text-right font-black text-gray-900 dark:text-white text-sm sm:text-lg">
                          ${venta.total_venta.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-16 text-center text-gray-400 italic font-bold">Aún no has registrado ventas en este turno.</div>
              )}
            </div>
          </section>
        </div>

        {/* Columna Lateral: Alertas y Promociones */}
        <div className="space-y-6 sm:space-y-8">
          
          {/* Monitor de Créditos / Fiados */}
          <section className="bg-amber-50 dark:bg-amber-900/10 p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-amber-100 dark:border-amber-900/30">
            <h2 className="text-[10px] sm:text-xs font-black text-amber-700 uppercase tracking-widest mb-4 sm:mb-6">Pendientes de Pago</h2>
            <div className="space-y-3 sm:space-y-4">
              {loading
                ? Array.from({ length: 2 }).map((_, index) => (
                    <div key={`cliente-skeleton-${index}`} className="p-4 bg-white dark:bg-gray-800 rounded-2xl animate-pulse">
                      <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full w-2/3 mb-3"></div>
                      <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded-full w-24"></div>
                    </div>
                  ))
                : clientesFiado.length > 0 ? (
                    clientesFiado.map(c => (
                      <div key={c.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
                        <p className="font-bold text-gray-900 dark:text-white text-sm break-words">{c.nombre}</p>
                        <p className="text-xl font-black text-amber-600 tracking-tighter">${c.saldo_deudado.toLocaleString()}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-amber-600/50 text-sm font-bold italic">No hay deudas críticas.</p>
                  )}
            </div>
            <Link href="/clientes" className="mt-6 block text-center py-3 bg-amber-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-amber-100 dark:shadow-none">Cobrar / Abonar</Link>
          </section>

          {/* Tablero de Ofertas */}
          <section className="bg-indigo-600 p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <h2 className="text-[10px] sm:text-xs font-black text-indigo-100 uppercase tracking-widest mb-4 sm:mb-6 relative z-10">Promociones Activas</h2>
            <div className="space-y-3 sm:space-y-4 relative z-10">
              {loading
                ? Array.from({ length: 2 }).map((_, index) => (
                    <div key={`promo-skeleton-${index}`} className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 animate-pulse">
                      <div className="h-4 bg-white/20 rounded-full w-2/3 mb-3"></div>
                      <div className="h-3 bg-white/20 rounded-full w-24"></div>
                    </div>
                  ))
                : promociones.length > 0 ? (
                    promociones.map(p => (
                      <div key={p.id} className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                        <p className="font-bold text-white text-sm break-words">{p.nombre}</p>
                        <p className="text-[10px] font-black text-indigo-200 uppercase mt-1 break-words">
                          {p.tipo === '2x1' ? 'Oferta 2x1' : `${p.valor}${p.tipo === 'porcentaje' ? '%' : '$'} de Descuento`}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-indigo-200 text-sm font-bold italic">Sin promociones hoy.</p>
                  )}
            </div>
            <div className="mt-8 p-4 bg-black/10 rounded-2xl">
              <p className="text-[10px] text-white/70 font-bold leading-relaxed uppercase italic">"Las promociones se aplican automáticamente en la pantalla de Nueva Venta."</p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
