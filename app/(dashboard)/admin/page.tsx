"use client";

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { roundMoney } from '@/lib/utils';

/**
 * Interfaz para las métricas consolidadas del Dashboard
 */
interface DashboardStats {
  ingresos: number;
  gastos: number;
  balance: number;
  cuentasPorCobrar: number;
  valorInventario: number;
  productosStockBajo: number;
  totalVentasContado: number;
  totalVentasCredito: number;
}

interface NotificacionAdminRow {
  id: string;
  tipo: 'descuadre' | 'solicitud_caja' | 'alerta' | 'venta_inactivada' | 'venta_reactivada';
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}

/**
 * Propiedades del componente MetricBox
 */
interface MetricBoxProps {
  title: string;
  value: number | undefined;
  subtext: string;
  color: string;
  bg: string;
  icon: string;
  loading?: boolean;
}

/**
 * Propiedades del componente DashLink
 */
interface DashLinkProps {
  href: string;
  label: string;
  icon: string;
}

/**
 * Página Principal del Panel Administrativo
 * Maneja la lógica de analítica financiera y estados de inventario
 */
export default function AdminDashboardPage() {
  const { role, isMounted } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [notificaciones, setNotificaciones] = useState<NotificacionAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tipos locales para asegurar la inferencia en las consultas
  interface VentaRow { total_venta: number; forma_pago: string; }
  interface CompraRow { total_compra: number; }
  interface CreditoRow { saldo_pendiente: number; }
  interface ProductoRow { stock_actual: number; stock_minimo: number; precio_compra: number; }

  // Optimización de carga: Paralelismo real y manejo de volumen
  useEffect(() => {
    if (!isMounted || role !== 'admin') {
      if (isMounted && role !== 'admin') setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Cada query se maneja individualmente para excluir ventas inactivas de las metricas.
        const [v, c, cr, p, n] = await Promise.allSettled([
          supabase.from('Venta').select('total_venta, forma_pago').neq('estado', 'anulada'),
          supabase.from('Compra').select('total_compra'),
          supabase.from('Credito').select('saldo_pendiente'),
          supabase.from('Producto').select('stock_actual, stock_minimo, precio_compra'),
          supabase.from('NotificacionAdmin').select('*').eq('leida', false).order('created_at', { ascending: false }).limit(5)
        ]);

        function extractData<T>(result: PromiseSettledResult<any>, table: string): T[] {
          if (result.status === 'rejected') {
            console.error(`[PanelControl] Query ${table} rechazada:`, result.reason);
            return [];
          }
          if (result.value.error) {
            console.error(`[PanelControl] Query ${table} error:`, result.value.error.message);
            return [];
          }
          return (result.value.data || []) as T[];
        }

        const ventas = extractData<VentaRow>(v, 'Venta');
        const compras = extractData<CompraRow>(c, 'Compra');
        const creditos = extractData<CreditoRow>(cr, 'Credito');
        const productos = extractData<ProductoRow>(p, 'Producto');
        const notifs = extractData<NotificacionAdminRow>(n, 'NotificacionAdmin');
        
        setNotificaciones(notifs);

        const ingresos = roundMoney(ventas.reduce((acc, val) => acc + (val.total_venta || 0), 0));
        const gastos = roundMoney(compras.reduce((acc, val) => acc + (val.total_compra || 0), 0));
        const cuentasPorCobrar = roundMoney(creditos.reduce((acc, val) => acc + (val.saldo_pendiente || 0), 0));
        const vContado = roundMoney(ventas.filter(v => v.forma_pago !== 'fiado').reduce((acc, val) => acc + (val.total_venta || 0), 0));
        const vCredito = roundMoney(ventas.filter(v => v.forma_pago === 'fiado').reduce((acc, val) => acc + (val.total_venta || 0), 0));

        let valorInv = 0;
        let sBajo = 0;
        for (let i = 0; i < productos.length; i++) {
          const prod = productos[i];
          valorInv += Math.round((prod.stock_actual || 0) * (prod.precio_compra || 0));
          if (prod.stock_actual <= prod.stock_minimo) sBajo++;
        }
        valorInv = roundMoney(valorInv);

        setStats({
          ingresos,
          gastos,
          balance: roundMoney(ingresos - gastos),
          cuentasPorCobrar,
          valorInventario: valorInv,
          productosStockBajo: sBajo,
          totalVentasContado: vContado,
          totalVentasCredito: vCredito
        });
      } catch (err: any) {
        console.error('[PanelControl] Error fatal en fetchAnalytics:', err.message ?? err, err.details ?? '', err.hint ?? '', err.code ?? '');
        setError('Error al procesar métricas. Por favor reintente.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [role, isMounted]);

  const eficienciaCobro = useMemo(() => {
    if (!stats || stats.ingresos === 0) return 0;
    return Math.round((stats.totalVentasContado / stats.ingresos) * 100);
  }, [stats]);

  const marcarNotificacionLeida = async (id: string) => {
    try {
      await (supabase as any).from('NotificacionAdmin').update({ leida: true }).eq('id', id);
      setNotificaciones(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  if (role !== 'admin') {
    return (
      <div className="p-16 text-center max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 shadow-2xl">
        <div className="text-6xl mb-6">🔒</div>
        <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase italic tracking-tighter">Área Restringida</h2>
        <p className="text-gray-400 font-bold mt-4 leading-relaxed">Se requiere perfil de Administrador.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-[2.5rem] text-center max-w-2xl mx-auto">
        <p className="text-red-600 font-black mb-4">⚠️ {error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      
      {/* Header Financiero */}
      <div className="bg-white dark:bg-gray-900 p-4 sm:p-8 lg:p-12 rounded-[2rem] sm:rounded-[3.5rem] shadow-2xl border border-gray-50 dark:border-gray-800 flex flex-col lg:flex-row justify-between items-center gap-6 sm:gap-8 lg:gap-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full -mr-48 -mt-48 blur-3xl transition-colors duration-1000"></div>
        
        <div className="relative z-10 text-center lg:text-left w-full">
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-black text-gray-900 dark:text-white tracking-tighter mb-3 italic leading-tight break-words">Panel de Control</h1>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.4em] flex items-center justify-center lg:justify-start gap-2 break-words">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Actualizado en tiempo real
          </p>
        </div>
        
        <div className="relative z-10 bg-gray-50 dark:bg-gray-800/50 p-4 sm:p-6 lg:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-gray-100 dark:border-gray-700 w-full lg:w-auto max-w-full">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 text-center">Balance Neto</p>
          <p className={`text-3xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-center break-words ${loading ? 'text-gray-400' : stats && stats.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {loading ? 'Cargando…' : `$${stats?.balance.toLocaleString() || '0'}`}
          </p>
        </div>
      </div>

      {/* Grid de Métricas Críticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <MetricBox title="Ingresos" value={stats?.ingresos} subtext="Ventas Totales" color="text-emerald-600" bg="bg-emerald-50" icon="💹" loading={loading} />
        <MetricBox title="Gastos" value={stats?.gastos} subtext="Compras" color="text-red-600" bg="bg-red-50" icon="📉" loading={loading} />
        <MetricBox title="Por Cobrar" value={stats?.cuentasPorCobrar} subtext="Créditos Pendientes" color="text-amber-600" bg="bg-amber-50" icon="⏳" loading={loading} />
        <MetricBox title="Inventario" value={stats?.valorInventario} subtext="Valor Capital" color="text-indigo-600" bg="bg-indigo-50" icon="🏢" loading={loading} />
      </div>

      {/* Analítica y Alertas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8 lg:gap-10">
        
        {/* Composición de Ventas */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-[2rem] sm:rounded-[3rem] p-5 sm:p-8 lg:p-10 border border-gray-100 dark:border-gray-700 shadow-sm relative group overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-8 sm:mb-10">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-4 italic break-words">
              <span className="w-2 h-10 bg-blue-600 rounded-full"></span>
              Dinámica de Cobros
            </h2>
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 font-black text-[10px] uppercase tracking-widest">
              KPI: {eficienciaCobro}% Eficiencia
            </div>
          </div>
          
          <div className="space-y-10">
            {loading ? (
              <>
                <div className="space-y-3 animate-pulse">
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-2/3"></div>
                  <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded-2xl"></div>
                </div>
                <div className="space-y-3 animate-pulse">
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-1/2"></div>
                  <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded-2xl"></div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-gray-500">
                    <span>Ventas al Contado (Efectivo/Transf)</span>
                    <span className="text-gray-900 dark:text-white">${stats?.totalVentasContado.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-5 bg-gray-50 dark:bg-gray-900 rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-gray-700">
                    <div 
                      className="h-full bg-blue-600 rounded-xl transition-all duration-1000 ease-out" 
                      style={{ width: stats && stats.ingresos > 0 ? `${(stats.totalVentasContado / stats.ingresos) * 100}%` : '0%' }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-gray-500">
                    <span>Ventas al Fiado (Créditos)</span>
                    <span className="text-gray-900 dark:text-white">${stats?.totalVentasCredito.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-5 bg-gray-50 dark:bg-gray-900 rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-gray-700">
                    <div 
                      className="h-full bg-amber-500 rounded-xl transition-all duration-1000 ease-out" 
                      style={{ width: stats && stats.ingresos > 0 ? `${(stats.totalVentasCredito / stats.ingresos) * 100}%` : '0%' }}
                    ></div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/50 rounded-[2rem] border border-gray-100 dark:border-gray-800">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Margen Contado</p>
              <p className="text-xl font-black text-gray-900 dark:text-white">{eficienciaCobro}%</p>
            </div>
            <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/50 rounded-[2rem] border border-gray-100 dark:border-gray-800">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Riesgo Fiado</p>
              <p className="text-xl font-black text-amber-600">{100 - eficienciaCobro}%</p>
            </div>
          </div>
        </div>

        {/* Acciones Rápidas y Alertas */}
        <div className="space-y-6">
          
          {notificaciones.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-200 dark:border-amber-800 p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-sm">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-amber-700 dark:text-amber-500 flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                Alertas Activas ({notificaciones.length})
              </h3>
              <div className="space-y-3">
                {notificaciones.map(n => (
                  <div key={n.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-amber-100 dark:border-gray-700 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-gray-900 dark:text-white text-sm">{n.titulo}</p>
                      <button onClick={() => marcarNotificacionLeida(n.id)} className="text-[10px] uppercase font-black text-amber-600 hover:text-amber-800 tracking-widest shrink-0 ml-2">Descartar</button>
                    </div>
                    <p className="text-xs text-gray-500 font-bold">{n.mensaje}</p>
                    <Link href={n.tipo === 'venta_inactivada' || n.tipo === 'venta_reactivada' ? '/ventas/historial' : '/caja'} className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">
                      {n.tipo === 'venta_inactivada' || n.tipo === 'venta_reactivada' ? 'Ir a Historial ->' : 'Ir a Caja ->'}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-red-600 p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-2xl shadow-red-200 dark:shadow-none text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8 blur-xl group-hover:scale-150 transition-transform duration-700"></div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-red-100">Alerta de Inventario</h3>
            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-14 bg-white/20 rounded-2xl w-28"></div>
                <div className="h-4 bg-white/20 rounded-full w-40"></div>
                <div className="h-12 bg-white/20 rounded-2xl"></div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-4xl sm:text-6xl font-black tracking-tighter">{stats?.productosStockBajo || 0}</p>
                  <p className="text-xs font-bold uppercase opacity-80 italic">Productos</p>
                </div>
                <p className="text-sm font-bold text-red-100/70 mt-2 break-words">Nivel bajo de stock detectado.</p>
                <Link href="/productos" className="mt-8 block text-center py-4 bg-white text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-colors shadow-xl">Gestionar Reabastecimiento</Link>
              </>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 sm:mb-8">Gestión de Operativa</h3>
            <div className="space-y-4">
              <DashLink href="/usuarios" label="Personal y Ventas" icon="👥" />
              <DashLink href="/proveedores" label="Gestión de Proveedores" icon="🏢" />
              <DashLink href="/compras" label="Historial de Gastos" icon="🧾" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/**
 * Componente Visual para Métricas de Cuadrícula
 */
function MetricBox({ title, value, subtext, color, bg, icon, loading }: MetricBoxProps) {
  return (
    <div className="bg-white dark:bg-gray-800 p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[2.5rem] border border-gray-50 dark:border-gray-700 shadow-sm transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 group">
      <div className="flex justify-between items-start mb-4 sm:mb-6">
        <div className={`w-12 h-12 sm:w-14 sm:h-14 ${bg} rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-sm group-hover:scale-110 transition-transform duration-500`}>{icon}</div>
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{title}</p>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded-full w-28"></div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-24"></div>
        </div>
      ) : (
        <>
          <p className={`text-2xl sm:text-3xl font-black ${color} tracking-tighter mb-1 break-words`}>
            ${value?.toLocaleString() || '0'}
          </p>
          <p className="text-[10px] font-bold text-gray-500 italic opacity-80 break-words">{subtext}</p>
        </>
      )}
    </div>
  );
}

/**
 * Componente para Enlaces Rápidos del Dashboard
 */
function DashLink({ href, label, icon }: DashLinkProps) {
  return (
    <Link href={href} className="flex items-center gap-3 sm:gap-5 p-4 sm:p-5 bg-gray-50 dark:bg-gray-900/50 rounded-2xl hover:bg-blue-600 hover:text-white transition-all group border border-transparent hover:border-blue-500">
      <span className="text-2xl group-hover:rotate-12 transition-transform shrink-0">{icon}</span>
      <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest break-words">{label}</span>
    </Link>
  );
}
