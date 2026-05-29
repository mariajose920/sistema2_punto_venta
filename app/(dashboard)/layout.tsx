"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import LogoutButton from '@/components/LogoutButton';

// Definición de ítems de navegación según el rol para mobile
const NAV_ITEMS = {
  shared: [
    { href: '/productos', label: 'Lista de Productos', icon: '📦' },
    { href: '/clientes', label: 'Lista de Clientes', icon: '👥' },
    { href: '/pedidos', label: 'Pedidos (Web)', icon: '📥' },
  ],
  admin: [
    { href: '/admin', label: 'Panel de Control', icon: '📊' },
    { href: '/caja', label: 'Gestión de Caja', icon: '💰' },
    { href: '/usuarios', label: 'Gestión de Usuarios', icon: '👮' },
    { href: '/admin/calculadora', label: 'Calculadora de Costos', icon: '🧮' },
    { href: '/compras', label: 'Compras y Proveedores', icon: '📥' },
    { href: '/reportes', label: 'Reportes y Análisis', icon: '📈' },
    { href: '/ventas/nueva', label: 'Nueva Venta', icon: '🛒' },
    { href: '/ventas/historial', label: 'Historial de Ventas', icon: '🧾' },
  ],
  cajera: [
    { href: '/cajera', label: 'Inicio Caja', icon: '🏠' },
    { href: '/caja', label: 'Gestión de Caja', icon: '💰' },
    { href: '/ventas/nueva', label: 'Nueva Venta', icon: '🛒' },
    { href: '/ventas/historial', label: 'Mi Historial', icon: '🧾' },
  ]
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, loading, isMounted } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Solicitudes de ajuste de stock pendientes (solo admin)
  interface SolicitudAjuste {
    id: string;
    cajera_id: string;
    producto_id: string;
    ajuste: number;
    motivo: string | null;
    estado: string;
    created_at: string;
    cajera?: { nombre?: string | null; email: string } | null;
    producto?: { nombre: string } | null;
  }
  const [solicitudesAjuste, setSolicitudesAjuste] = useState<SolicitudAjuste[]>([]);
  const [duracionMap, setDuracionMap] = useState<Record<string, string>>({});
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const solicitudesRef = useRef<SolicitudAjuste[]>([]);

  // Solicitar permiso de notificaciones del navegador (solo admin)
  useEffect(() => {
    if (role === 'admin' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [role]);

  // Polling cada 20 segundos para detectar solicitudes nuevas (solo admin)
  useEffect(() => {
    if (role !== 'admin') return;

    const fetchSolicitudes = async () => {
      const { data } = await (supabase.from('SolicitudAjusteStock') as any)
        .select('*, cajera:Usuario!SolicitudAjusteStock_cajera_id_fkey(nombre, email), producto:Producto!SolicitudAjusteStock_producto_id_fkey(nombre)')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false });

      const nuevas = data || [];
      setSolicitudesAjuste(nuevas);

      // Notificación del navegador para solicitudes nuevas
      const ids_antes = solicitudesRef.current.map((s: SolicitudAjuste) => s.id);
      const nuevasNoVistas = nuevas.filter((s: SolicitudAjuste) => !ids_antes.includes(s.id));
      if (nuevasNoVistas.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
        const s = nuevasNoVistas[0];
        const n = new Notification('⚠️ Solicitud de ajuste de stock pendiente', {
          body: `${s.cajera?.nombre || s.cajera?.email || 'Cajera'} solicita ajustar ${s.producto?.nombre || 'producto'} en ${s.ajuste > 0 ? '+' : ''}${s.ajuste}`,
          icon: '/favicon.ico',
          tag: 'solicitud-ajuste',
          requireInteraction: true,
        });
        n.onclick = () => {
          window.focus();
          router.push('/admin');
          n.close();
        };
      }
      solicitudesRef.current = nuevas;
    };

    fetchSolicitudes();
    const interval = setInterval(fetchSolicitudes, 20000);
    return () => clearInterval(interval);
  }, [role, router]);

  const handleResponderSolicitud = async (solicitud: SolicitudAjuste, accion: 'una_vez' | 'rechazar' | 'temporal') => {
    if (procesandoId) return;
    setProcesandoId(solicitud.id);
    try {
      if (accion === 'rechazar') {
        await (supabase.from('SolicitudAjusteStock') as any)
          .update({ estado: 'rechazada', admin_id: user?.id, responded_at: new Date().toISOString() })
          .eq('id', solicitud.id);
      } else if (accion === 'una_vez') {
        // Aprobar y aplicar el ajuste directamente desde el admin
        const { data: prod } = await (supabase.from('Producto') as any)
          .select('stock_actual')
          .eq('id', solicitud.producto_id)
          .single();
        if (prod) {
          const nuevoStock = (prod.stock_actual ?? 0) + solicitud.ajuste;
          if (nuevoStock >= 0) {
            await (supabase.from('Producto') as any)
              .update({ stock_actual: nuevoStock })
              .eq('id', solicitud.producto_id);
            await (supabase.from('AjusteStock') as any).insert([{
              producto_id: solicitud.producto_id,
              usuario_id: user?.id,
              ajuste: solicitud.ajuste,
              stock_antes: prod.stock_actual ?? 0,
              stock_despues: nuevoStock,
              tipo: 'autorizado_una_vez',
              solicitud_id: solicitud.id,
            }]);
          }
        }
        await (supabase.from('SolicitudAjusteStock') as any)
          .update({ estado: 'aprobada', admin_id: user?.id, tipo_aprobacion: 'una_vez', responded_at: new Date().toISOString() })
          .eq('id', solicitud.id);
      } else if (accion === 'temporal') {
        const minStr = duracionMap[solicitud.id] || '30';
        const minutos = Math.max(1, parseInt(minStr, 10) || 30);
        const expira = new Date(Date.now() + minutos * 60 * 1000).toISOString();
        await (supabase.from('SolicitudAjusteStock') as any)
          .update({
            estado: 'aprobada',
            admin_id: user?.id,
            tipo_aprobacion: 'temporal',
            duracion_minutos: minutos,
            expira_en: expira,
            responded_at: new Date().toISOString()
          })
          .eq('id', solicitud.id);
      }
      // Refrescar lista
      setSolicitudesAjuste(prev => prev.filter(s => s.id !== solicitud.id));
    } catch (err: any) {
      alert('Error al procesar solicitud: ' + err.message);
    } finally {
      setProcesandoId(null);
    }
  };

  if (!isMounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthGuard />;
  }

  // Instrumentación de rendimiento [PERF_WATERFALL]
  const startLayoutRender = performance.now();
  console.log(`[PERF_WATERFALL] [DashboardLayout] Primer render de UI (Shell) disparado. Usuario: ${user?.email || 'Pendiente'}, Rol: ${role || 'Pendiente'}`);

  // Determinar el mensaje de contexto según el rol
  const contextMessage = role === 'admin'
    ? 'Modo Control Total: Supervisando operaciones y finanzas.'
    : 'Modo Atención: Registrando ventas y atendiendo clientes.';

  // Ítems de navegación rápida para la barra inferior mobile
  const quickNavItems = role === 'admin'
    ? [
        { href: '/admin', icon: '📊', label: 'Panel' },
        { href: '/caja', icon: '💰', label: 'Caja' },
        { href: '/ventas/nueva', icon: '🛒', label: 'Venta' },
        { href: '/productos', icon: '📦', label: 'Productos' },
      ]
    : [
        { href: '/cajera', icon: '🏠', label: 'Inicio' },
        { href: '/caja', icon: '💰', label: 'Caja' },
        { href: '/ventas/nueva', icon: '🛒', label: 'Venta' },
        { href: '/ventas/historial', icon: '🧾', label: 'Historial' },
      ];

  return (
    <>
      <AuthGuard />
      <div className="flex min-h-screen overflow-x-hidden bg-[#F8FAFC] dark:bg-gray-950 font-sans selection:bg-blue-100 selection:text-blue-700">

        {/* ── Overlay mobile backdrop ── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Drawer de navegación mobile ── */}
        <div className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-50 transition-transform duration-300 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
            <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-200 dark:shadow-none">P</div>
              <span className="font-black text-lg tracking-tight text-gray-900 dark:text-white">POS<span className="text-blue-600">MASTER</span></span>
            </Link>
            <button onClick={() => setMobileOpen(false)} className="p-2 text-gray-400 hover:text-gray-600">✕</button>
          </div>

          {/* Nav mobile */}
          <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Principal</p>
              <div className="space-y-1">
                {role === 'admin' && NAV_ITEMS.admin.slice(0, 2).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
                {role === 'cajera' && NAV_ITEMS.cajera.slice(0, 2).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
              </div>
            </div>
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Ventas</p>
              <div className="space-y-1">
                {role === 'admin' && NAV_ITEMS.admin.slice(6, 8).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
                {role === 'cajera' && NAV_ITEMS.cajera.slice(2).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
              </div>
            </div>
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Catálogos</p>
              <div className="space-y-1">
                {NAV_ITEMS.shared.map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
              </div>
            </div>
            {role === 'admin' && (
              <div>
                <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Gestión</p>
                <div className="space-y-1">
                  {NAV_ITEMS.admin.slice(2, 6).map(item => (
                    <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* Footer drawer mobile */}
          <div className="p-4 bg-gray-50/50 dark:bg-gray-800/20 m-4 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.email}</p>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{role}</p>
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>

        {/* ── Barra Lateral Desktop (SERVER Component puro, optimizado) ── */}
        <Sidebar role={role} user={user} pathname={pathname} />

        {/* Contenido Principal */}
        <div className="lg:ml-72 flex-1 flex flex-col min-h-screen min-w-0">

          {/* Header Superior */}
          <header className="min-h-[4rem] lg:h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20 px-3 sm:px-4 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 overflow-x-hidden">
            <div className="flex items-center gap-2 lg:gap-4 min-w-0">
              {/* Botón hamburguesa — solo mobile */}
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                aria-label="Abrir menú"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className={`px-3 py-1 rounded-full text-[9px] sm:text-xs font-black uppercase tracking-wider break-words ${role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {role}
              </div>
              <p className="hidden md:block text-sm text-gray-500 font-medium truncate">
                {contextMessage}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 shrink-0">
              <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                <span className="text-xl">🔔</span>
              </button>
              <div className="h-8 w-px bg-gray-200 dark:bg-gray-800"></div>
              <div className="text-right hidden sm:block min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Fecha Hoy</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
          </header>

          {/* ── Banda de notificaciones: Solicitudes de Ajuste de Stock Pendientes (solo admin) ── */}
          {role === 'admin' && solicitudesAjuste.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b-2 border-amber-200 dark:border-amber-700 px-4 lg:px-8 py-3 space-y-2">
              <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse inline-block"></span>
                {solicitudesAjuste.length} solicitud(es) de ajuste de stock pendiente(s)
              </p>
              {solicitudesAjuste.map(s => (
                <div key={s.id} className="bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-4 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-900 dark:text-white">
                      👤 <span>{s.cajera?.nombre || s.cajera?.email || 'Cajera'}</span>
                      <span className="mx-2 text-gray-400">•</span>
                      📦 <span>{s.producto?.nombre || '...'}</span>
                      <span className="mx-2 text-gray-400">•</span>
                      <span className={`font-black ${s.ajuste < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {s.ajuste > 0 ? '+' : ''}{s.ajuste}
                      </span>
                    </p>
                    {s.motivo && <p className="text-[10px] text-gray-500 italic mt-0.5">"{s.motivo}"</p>}
                    <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleResponderSolicitud(s, 'una_vez')}
                      disabled={!!procesandoId}
                      className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 active:scale-95"
                    >
                      ✓ Aceptar (1 vez)
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        placeholder="Min"
                        value={duracionMap[s.id] || ''}
                        onChange={e => setDuracionMap(prev => ({ ...prev, [s.id]: e.target.value }))}
                        className="w-16 px-2 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-[10px] font-bold border-none text-center"
                      />
                      <button
                        onClick={() => handleResponderSolicitud(s, 'temporal')}
                        disabled={!!procesandoId}
                        className="px-3 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50 active:scale-95"
                      >
                        ⏱ Temporal
                      </button>
                    </div>
                    <button
                      onClick={() => handleResponderSolicitud(s, 'rechazar')}
                      disabled={!!procesandoId}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-200 transition-all disabled:opacity-50 active:scale-95"
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Área de Página — pb-20 en mobile para no quedar bajo la barra inferior */}
          <main className="w-full max-w-full p-3 sm:p-4 lg:p-8 flex-1 pb-24 lg:pb-8 overflow-x-hidden min-w-0">
            {children}
          </main>
        </div>

        {/* ── Barra de navegación rápida inferior — solo mobile ── */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-30 lg:hidden safe-area-bottom">
          <div className="grid grid-cols-5 gap-1 px-1 py-1.5">
            {quickNavItems.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-all ${
                    isActive ? 'text-blue-600' : 'text-gray-400'
                  }`}
                >
                  <span className="text-xl leading-none">{item.icon}</span>
                  <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-wider break-words text-center ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {/* Botón menú completo */}
            <button
              onClick={() => setMobileOpen(true)}
              className="flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-gray-400"
            >
              <span className="text-xl leading-none">☰</span>
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider break-words text-center">Más</span>
            </button>
          </div>
        </nav>

      </div>
    </>
  );
}

// Subcomponente NavLink para consistencia
function NavLink({ item, active, onNavigate }: { item: any; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm group ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none'
          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <span className={`text-xl transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

