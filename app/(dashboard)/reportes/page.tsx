"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, normalizeText } from '@/lib/utils';
import { Database } from '@/types/database.types';

type VentaRow = Database['public']['Tables']['Venta']['Row'];
type ProductoRow = Database['public']['Tables']['Producto']['Row'];
type UsuarioRow = Database['public']['Tables']['Usuario']['Row'];
type DetalleVentaRow = Database['public']['Tables']['DetalleVenta']['Row'];

interface ReportData {
  ventas: VentaRow[];
  productos: ProductoRow[];
  usuarios: UsuarioRow[];
  detalles: (DetalleVentaRow & { Producto: ProductoRow | null })[];
}

export default function ReportesPage() {
  const { role, isMounted } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros de fecha
  const [fechaDesde, setFechaDesde] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Ventas en rango
      const { data: vData, error: vError } = await (supabase.from('Venta') as any)
        .select('*')
        .gte('fecha_venta', `${fechaDesde}T00:00:00`)
        .lte('fecha_venta', `${fechaHasta}T23:59:59`)
        .order('fecha_venta', { ascending: false });

      if (vError) throw vError;

      // 2. Fetch Detalles vinculados a esas ventas
      const ventaIds = (vData || []).map((v: any) => v.id_venta);
      let dData: any[] = [];
      if (ventaIds.length > 0) {
        const { data: detData, error: detError } = await (supabase.from('DetalleVenta') as any)
          .select('*, Producto(*)')
          .in('id_venta', ventaIds);
        if (detError) throw detError;
        dData = detData || [];
      }

      // 3. Fetch Todos los productos (para stock y costos)
      const { data: pData, error: pError } = await (supabase.from('Producto') as any).select('*');
      if (pError) throw pError;

      // 4. Fetch Usuarios
      const { data: uData, error: uError } = await (supabase.from('Usuario') as any).select('*');
      if (uError) throw uError;

      setData({
        ventas: vData || [],
        productos: pData || [],
        usuarios: uData || [],
        detalles: dData
      });

    } catch (err: any) {
      console.error('Error fetching report data:', err);
      setError('Error al cargar los datos del reporte.');
    } finally {
      setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  useEffect(() => {
    if (isMounted && role === 'admin') {
      fetchData();
    }
  }, [isMounted, role, fetchData]);

  // Cálculos Memorizados
  const stats = useMemo(() => {
    if (!data) return null;

    const { ventas, detalles, productos, usuarios } = data;

    // A. Resumen General
    const totalVentas = ventas.reduce((acc, v) => acc + (v.total_venta || 0), 0);
    const cantidadVentas = ventas.length;
    const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;

    const porMetodo = {
      efectivo: ventas.filter(v => v.forma_pago === 'efectivo').reduce((acc, v) => acc + (v.total_venta || 0), 0),
      transferencia: ventas.filter(v => v.forma_pago === 'transferencia').reduce((acc, v) => acc + (v.total_venta || 0), 0),
      tarjeta: ventas.filter(v => v.forma_pago === 'tarjeta').reduce((acc, v) => acc + (v.total_venta || 0), 0),
      fiado: ventas.filter(v => v.forma_pago === 'fiado').reduce((acc, v) => acc + (v.total_venta || 0), 0),
    };

    // B. Análisis de Productos
    const prodStats: Record<string, { cant: number; ganancia: number; nombre: string }> = {};
    detalles.forEach(d => {
      if (!d.id_producto) return;
      if (!prodStats[d.id_producto]) {
        prodStats[d.id_producto] = { cant: 0, ganancia: 0, nombre: d.Producto?.nombre || 'Producto Desconocido' };
      }
      prodStats[d.id_producto].cant += d.cantidad;
      const costo = d.Producto?.precio_compra || 0;
      const venta = d.precio_unitario_venta || 0;
      prodStats[d.id_producto].ganancia += (venta - costo) * d.cantidad;
    });

    const sortedByCant = Object.values(prodStats).sort((a, b) => b.cant - a.cant);
    const sortedByProfit = Object.values(prodStats).sort((a, b) => b.ganancia - a.ganancia);

    const stockBajo = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo);
    const sinStock = productos.filter(p => p.stock_actual <= 0);

    // C. Rendimiento Cajeras
    const cajeraStats: Record<string, { monto: number; cant: number; nombre: string }> = {};
    ventas.forEach(v => {
      const u = usuarios.find(user => user.id === v.id_usuario_cajera);
      const nombre = u ? `${u.nombre} ${u.apellido || ''}` : 'Cajera Desconocida';
      if (!cajeraStats[v.id_usuario_cajera]) {
        cajeraStats[v.id_usuario_cajera] = { monto: 0, cant: 0, nombre };
      }
      cajeraStats[v.id_usuario_cajera].monto += (v.total_venta || 0);
      cajeraStats[v.id_usuario_cajera].cant += 1;
    });

    const mejorCajera = Object.values(cajeraStats).sort((a, b) => b.monto - a.monto)[0] || null;

    return {
      totalVentas,
      cantidadVentas,
      ticketPromedio,
      porMetodo,
      masVendido: sortedByCant[0] || null,
      mayorGanancia: sortedByProfit[0] || null,
      menorGanancia: sortedByProfit[sortedByProfit.length - 1] || null,
      stockBajo,
      sinStock,
      cajeraStats: Object.values(cajeraStats).sort((a, b) => b.monto - a.monto),
      mejorCajera
    };
  }, [data]);

  // Función de exportación a CSV
  const exportCSV = () => {
    if (!data || !stats) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "REPORTE DE VENTAS\n";
    csvContent += `Rango: ${fechaDesde} al ${fechaHasta}\n\n`;
    
    csvContent += "RESUMEN GENERAL\n";
    csvContent += `Total Ventas,${stats.totalVentas}\n`;
    csvContent += `Cantidad Ventas,${stats.cantidadVentas}\n`;
    csvContent += `Ticket Promedio,${stats.ticketPromedio}\n\n`;

    csvContent += "DETALLE POR METODO DE PAGO\n";
    csvContent += `Efectivo,${stats.porMetodo.efectivo}\n`;
    csvContent += `Transferencia,${stats.porMetodo.transferencia}\n`;
    csvContent += `Tarjeta,${stats.porMetodo.tarjeta}\n`;
    csvContent += `Fiado,${stats.porMetodo.fiado}\n\n`;

    csvContent += "DETALLE DE VENTAS EN EL PERIODO\n";
    csvContent += "ID Venta,Fecha,Cajera,Metodo,Total\n";
    data.ventas.forEach(v => {
      const u = data.usuarios.find(user => user.id === v.id_usuario_cajera);
      const cajera = u ? `${u.nombre} ${u.apellido || ''}` : 'N/A';
      csvContent += `${v.id_venta},${v.fecha_venta},${cajera},${v.forma_pago},${v.total_venta}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reporte_POS_${fechaDesde}_${fechaHasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isMounted || loading) {
    return <div className="p-20 text-center animate-pulse font-black text-gray-400 uppercase tracking-widest">Generando Inteligencia de Negocios...</div>;
  }

  if (role !== 'admin') {
    return (
      <div className="p-16 text-center max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 shadow-2xl">
        <div className="text-6xl mb-6">🔒</div>
        <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase italic tracking-tighter">Área Restringida</h2>
        <p className="text-gray-400 font-bold mt-4 leading-relaxed">Se requiere perfil de Administrador para acceder a Reportes y Análisis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      
      {/* Header con Filtros */}
      <div className="bg-white dark:bg-gray-900 p-10 rounded-[3rem] shadow-2xl border border-gray-50 dark:border-gray-800 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic">Reportes & Análisis</h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2 opacity-60">Auditoría Financiera y Operativa</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-transparent border-none p-0 text-xs font-black text-blue-600 focus:ring-0 cursor-pointer" />
            <span className="text-gray-300 font-black">→</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-transparent border-none p-0 text-xs font-black text-blue-600 focus:ring-0 cursor-pointer" />
          </div>
          
          <button 
            onClick={exportCSV}
            className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95"
          >
            📥 Exportar CSV
          </button>
        </div>
      </div>

      {/* A. Resumen General */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportCard title="Ventas Totales" value={formatCurrency(stats?.totalVentas || 0)} icon="💰" color="text-gray-900 dark:text-white" />
        <ReportCard title="Cantidad Ventas" value={`${stats?.cantidadVentas || 0} Operaciones`} icon="🧾" color="text-blue-600" />
        <ReportCard title="Ticket Promedio" value={formatCurrency(stats?.ticketPromedio || 0)} icon="📊" color="text-indigo-600" />
        <ReportCard title="Mejor Cajera" value={stats?.mejorCajera?.nombre || 'N/A'} icon="⭐" color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Métodos de Pago */}
        <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Flujo por Método de Pago</h3>
          <div className="space-y-6">
            <PaymentRow label="Efectivo" value={stats?.porMetodo.efectivo || 0} total={stats?.totalVentas || 1} color="bg-emerald-500" />
            <PaymentRow label="Tarjeta" value={stats?.porMetodo.tarjeta || 0} total={stats?.totalVentas || 1} color="bg-blue-500" />
            <PaymentRow label="Transferencia" value={stats?.porMetodo.transferencia || 0} total={stats?.totalVentas || 1} color="bg-purple-500" />
            <PaymentRow label="Fiado" value={stats?.porMetodo.fiado || 0} total={stats?.totalVentas || 1} color="bg-amber-500" />
          </div>
        </div>

        {/* Productos Top */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Análisis de Productos</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
              <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-2">Más Vendido (Cantidad)</p>
              <p className="text-lg font-black text-gray-900 dark:text-white uppercase truncate">{stats?.masVendido?.nombre || 'N/A'}</p>
              <p className="text-2xl font-black text-blue-600 mt-1">{stats?.masVendido?.cant || 0} <span className="text-[10px] uppercase opacity-50">Unidades</span></p>
            </div>
            <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Mayor Utilidad</p>
              <p className="text-lg font-black text-gray-900 dark:text-white uppercase truncate">{stats?.mayorGanancia?.nombre || 'N/A'}</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(stats?.mayorGanancia?.ganancia || 0)} <span className="text-[10px] uppercase opacity-50">Ganancia Neta</span></p>
            </div>
            <div className="p-6 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2">Menor Utilidad</p>
              <p className="text-lg font-black text-gray-900 dark:text-white uppercase truncate">{stats?.menorGanancia?.nombre || 'N/A'}</p>
              <p className="text-2xl font-black text-rose-600 mt-1">{formatCurrency(stats?.menorGanancia?.ganancia || 0)} <span className="text-[10px] uppercase opacity-50">Ganancia Neta</span></p>
            </div>
          </div>

          <div className="mt-8">
             <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Alertas de Inventario</h4>
             <div className="flex gap-4">
                <div className="flex-1 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{stats?.stockBajo.length || 0} Stock Bajo</p>
                </div>
                <div className="flex-1 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{stats?.sinStock.length || 0} Sin Stock</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* C. Rendimiento Cajeras */}
      <div className="bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-10 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center bg-gray-50/20 dark:bg-gray-900/10">
          <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Rendimiento Comparativo Cajeras</h3>
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <tr>
                <th className="px-10 py-6">Perfil / Colaboradora</th>
                <th className="px-10 py-6">Tickets Emitidos</th>
                <th className="px-10 py-6 text-right">Monto Recaudado</th>
                <th className="px-10 py-6 text-right">Porcentaje de Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {stats?.cajeraStats.map(c => (
                <tr key={c.nombre} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 font-black">
                        {c.nombre.charAt(0)}
                      </div>
                      <span className="font-black text-gray-900 dark:text-white uppercase text-sm italic">{c.nombre}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 font-bold text-gray-500">{c.cant} Ventas</td>
                  <td className="px-10 py-8 text-right font-black text-gray-900 dark:text-white text-xl tracking-tighter">{formatCurrency(c.monto)}</td>
                  <td className="px-10 py-8 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="w-24 h-2 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${(c.monto / (stats.totalVentas || 1)) * 100}%` }}></div>
                      </div>
                      <span className="text-[10px] font-black text-blue-600">{Math.round((c.monto / (stats.totalVentas || 1)) * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-4">
          {stats?.cajeraStats.map(c => (
            <div key={c.nombre} className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 font-black shrink-0">
                  {c.nombre.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-gray-900 dark:text-white uppercase text-sm italic truncate">{c.nombre}</p>
                  <p className="text-[10px] font-bold text-gray-500">{c.cant} Ventas</p>
                </div>
                <p className="font-black text-gray-900 dark:text-white text-lg tracking-tighter">{formatCurrency(c.monto)}</p>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600" style={{ width: `${(c.monto / (stats.totalVentas || 1)) * 100}%` }}></div>
                </div>
                <span className="text-[10px] font-black text-blue-600 shrink-0">{Math.round((c.monto / (stats.totalVentas || 1)) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function ReportCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-2xl group">
      <div className="flex justify-between items-center mb-6">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
        <span className="text-2xl group-hover:scale-125 transition-transform">{icon}</span>
      </div>
      <p className={`text-3xl font-black ${color} tracking-tighter`}>{value}</p>
    </div>
  );
}

function PaymentRow({ label, value, total, color }: any) {
  const percentage = Math.round((value / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
        <span>{label}</span>
        <span className="text-gray-900 dark:text-white">{formatCurrency(value)}</span>
      </div>
      <div className="w-full h-3 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}
