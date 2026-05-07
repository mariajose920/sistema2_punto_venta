"use client";

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tipos locales para asegurar la inferencia en las consultas
  interface VentaRow { total_venta: number; forma_pago: string; }
  interface CompraRow { total_compra: number; }
  interface CreditoRow { saldo_pendiente: number; }
  interface ProductoRow { stock_actual: number; stock_minimo: number; precio_compra: number; }

  useEffect(() => {
    // Protección de ruta y prevención de ejecución antes de hidratación
    if (!isMounted) return;
    if (role !== 'admin') {
      setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          { data: vData, error: e1 },
          { data: cData, error: e2 },
          { data: crData, error: e3 },
          { data: pData, error: e4 }
        ] = await Promise.all([
          supabase.from('Venta').select('total_venta, forma_pago'),
          supabase.from('Compra').select('total_compra'),
          supabase.from('Credito').select('saldo_pendiente'),
          supabase.from('Producto').select('stock_actual, stock_minimo, precio_compra')
        ]);

        if (e1 || e2 || e3 || e4) throw new Error('Error al sincronizar con la base de datos.');

        const ventas = (vData || []) as unknown as VentaRow[];
        const compras = (cData || []) as unknown as CompraRow[];
        const creditos = (crData || []) as unknown as CreditoRow[];
        const productos = (pData || []) as unknown as ProductoRow[];

        // Cálculos financieros con tipos seguros
        const ingresos = ventas.reduce((acc, v) => acc + (Number(v.total_venta) || 0), 0);
        const gastos = compras.reduce((acc, c) => acc + (Number(c.total_compra) || 0), 0);
        const cuentasPorCobrar = creditos.reduce((acc, cr) => acc + (Number(cr.saldo_pendiente) || 0), 0);
        
        const totalVentasContado = ventas.filter(v => v.forma_pago !== 'fiado').reduce((acc, v) => acc + (Number(v.total_venta) || 0), 0);
        const totalVentasCredito = ventas.filter(v => v.forma_pago === 'fiado').reduce((acc, v) => acc + (Number(v.total_venta) || 0), 0);

        let valorInventario = 0;
        let stockBajo = 0;
        
        productos.forEach(p => {
          const stock = Number(p.stock_actual) || 0;
          const costo = Number(p.precio_compra) || 0;
          const minimo = Number(p.stock_minimo) || 0;
          
          valorInventario += (stock * costo);
          if (stock <= minimo) stockBajo++;
        });

        setStats({
          ingresos,
          gastos,
          balance: ingresos - gastos,
          cuentasPorCobrar,
          valorInventario,
          productosStockBajo: stockBajo,
          totalVentasContado,
          totalVentasCredito
        });
      } catch (err: any) {
        console.error('CRITICAL_DASHBOARD_ERROR:', err);
        setError(err.message || 'Error desconocido al cargar analítica.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [role, isMounted]);

  // Indicador de Eficiencia (Cálculo derivado memorizado)
  const eficienciaCobro = useMemo(() => {
    if (!stats || stats.ingresos === 0) return 0;
    return Math.round((stats.totalVentasContado / stats.ingresos) * 100);
  }, [stats]);

  // Estado: Cargando
  if (!isMounted || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <div className="w-14 h-14 border-4 border-blue-600/10 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Métricas...</p>
      </div>
    );
  }

  // Estado: Acceso Denegado
  if (role !== 'admin') {
    return (
      <div className="p-16 text-center max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 shadow-2xl">
        <div className="text-6xl mb-6">🔒</div>
        <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase italic tracking-tighter">Área Restringida</h2>
        <p className="text-gray-400 font-bold mt-4 leading-relaxed">Lo sentimos, esta sección del sistema está reservada exclusivamente para cuentas con perfil de Administrador.</p>
        <Link href="/" className="mt-8 inline-block bg-blue-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all">Regresar al Inicio</Link>
      </div>
    );
  }

  // Estado: Error de Conexión
  if (error) {
    return (
      <div className="p-12 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-[2.5rem] text-center max-w-2xl mx-auto">
        <p className="text-red-600 font-black text-lg mb-4">⚠️ {error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase">Reintentar Conexión</button>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-1000 slide-in-from-bottom-4">
      
      {/* Header Financiero */}
      <div className="bg-white dark:bg-gray-900 p-12 rounded-[3.5rem] shadow-2xl border border-gray-50 dark:border-gray-800 flex flex-col lg:flex-row justify-between items-center gap-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full -mr-48 -mt-48 blur-3xl group-hover:bg-blue-600/10 transition-colors duration-1000"></div>
        
        <div className="relative z-10 text-center lg:text-left">
          <h1 className="text-5xl font-black text-gray-900 dark:text-white tracking-tighter mb-3 italic">Control Administrativo</h1>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.4em] flex items-center justify-center lg:justify-start gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Estado del Negocio en Tiempo Real
          </p>
        </div>
        
        <div className="relative z-10 bg-gray-50 dark:bg-gray-800/50 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 px-12">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 text-center">Balance Neto Consolidado</p>
          <p className={`text-6xl font-black tracking-tighter text-center ${stats && stats.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            ${stats?.balance.toLocaleString() || '0'}
          </p>
        </div>
      </div>

      {/* Grid de Métricas Críticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricBox title="Ingresos Brutos" value={stats?.ingresos} subtext="Total Ventas" color="text-emerald-600" bg="bg-emerald-50" icon="💹" />
        <MetricBox title="Egresos / Gastos" value={stats?.gastos} subtext="Compras Realizadas" color="text-red-600" bg="bg-red-50" icon="📉" />
        <MetricBox title="Cuentas por Cobrar" value={stats?.cuentasPorCobrar} subtext="Créditos Vigentes" color="text-amber-600" bg="bg-amber-50" icon="⏳" />
        <MetricBox title="Patrimonio Stock" value={stats?.valorInventario} subtext="Valor de Compra" color="text-indigo-600" bg="bg-indigo-50" icon="🏢" />
      </div>

      {/* Analítica y Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Composición de Ventas */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-[3rem] p-10 border border-gray-100 dark:border-gray-700 shadow-sm relative group overflow-hidden">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-4 italic">
              <span className="w-2 h-10 bg-blue-600 rounded-full"></span>
              Dinámica de Cobros
            </h2>
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 font-black text-[10px] uppercase tracking-widest">
              KPI: {eficienciaCobro}% Eficiencia
            </div>
          </div>
          
          <div className="space-y-10">
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
          </div>

          <div className="mt-12 grid grid-cols-2 gap-4">
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-800">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Margen Contado</p>
              <p className="text-xl font-black text-gray-900 dark:text-white">{eficienciaCobro}%</p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-800">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Riesgo Fiado</p>
              <p className="text-xl font-black text-amber-600">{100 - eficienciaCobro}%</p>
            </div>
          </div>
        </div>

        {/* Acciones Rápidas y Alertas */}
        <div className="space-y-6">
          <div className="bg-red-600 p-10 rounded-[3rem] shadow-2xl shadow-red-200 dark:shadow-none text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8 blur-xl group-hover:scale-150 transition-transform duration-700"></div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-red-100">Alerta de Inventario</h3>
            <div className="flex items-baseline gap-2">
              <p className="text-6xl font-black tracking-tighter">{stats?.productosStockBajo || 0}</p>
              <p className="text-xs font-bold uppercase opacity-80 italic">Productos</p>
            </div>
            <p className="text-sm font-bold text-red-100/70 mt-2">Nivel bajo de stock detectado.</p>
            <Link href="/productos" className="mt-8 block text-center py-4 bg-white text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-colors shadow-xl">Gestionar Reabastecimiento</Link>
          </div>

          <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Gestión de Operativa</h3>
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
function MetricBox({ title, value, subtext, color, bg, icon }: MetricBoxProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 p-10 rounded-[2.5rem] border border-gray-50 dark:border-gray-700 shadow-sm transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 group`}>
      <div className="flex justify-between items-start mb-6">
        <div className={`w-14 h-14 ${bg} rounded-2xl flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform duration-500`}>{icon}</div>
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{title}</p>
      <p className={`text-3xl font-black ${color} tracking-tighter mb-1`}>
        ${value?.toLocaleString() || '0'}
      </p>
      <p className="text-[10px] font-bold text-gray-500 italic opacity-80">{subtext}</p>
    </div>
  );
}

/**
 * Componente para Enlaces Rápidos del Dashboard
 */
function DashLink({ href, label, icon }: DashLinkProps) {
  return (
    <Link href={href} className="flex items-center gap-5 p-5 bg-gray-50 dark:bg-gray-900/50 rounded-2xl hover:bg-blue-600 hover:text-white transition-all group border border-transparent hover:border-blue-500">
      <span className="text-2xl group-hover:rotate-12 transition-transform">{icon}</span>
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
    </Link>
  );
}
