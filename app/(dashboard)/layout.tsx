"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';

// Definición de ítems de navegación según el rol
const NAV_ITEMS = {
  shared: [
    { href: '/productos', label: 'Lista de Productos', icon: '📦' },
    { href: '/clientes', label: 'Lista de Clientes', icon: '👥' },
    { href: '/pedidos', label: 'Pedidos (Web)', icon: '📥' },
  ],
  admin: [
    { href: '/admin', label: 'Panel de Control', icon: '📊' },
    { href: '/usuarios', label: 'Gestión de Usuarios', icon: '👮' },
    { href: '/admin/calculadora', label: 'Calculadora de Costos', icon: '🧮' },
    { href: '/compras', label: 'Compras y Proveedores', icon: '📥' },
    { href: '/reportes', label: 'Reportes y Análisis', icon: '📈' },
    { href: '/ventas/nueva', label: 'Nueva Venta', icon: '🛒' },
    { href: '/ventas/historial', label: 'Historial de Ventas', icon: '🧾' },
  ],
  cajera: [
    { href: '/cajera', label: 'Inicio Caja', icon: '🏠' },
    { href: '/ventas/nueva', label: 'Nueva Venta', icon: '🛒' },
    { href: '/ventas/historial', label: 'Mi Historial', icon: '🧾' },
  ]
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Determinar el mensaje de contexto según el rol
  const contextMessage = role === 'admin'
    ? 'Modo Control Total: Supervisando operaciones y finanzas.'
    : 'Modo Atención: Registrando ventas y atendiendo clientes.';

  // Ítems de navegación rápida para la barra inferior mobile
  const quickNavItems = role === 'admin'
    ? [
        { href: '/admin', icon: '📊', label: 'Panel' },
        { href: '/ventas/nueva', icon: '🛒', label: 'Venta' },
        { href: '/clientes', icon: '👥', label: 'Clientes' },
        { href: '/productos', icon: '📦', label: 'Productos' },
      ]
    : [
        { href: '/cajera', icon: '🏠', label: 'Inicio' },
        { href: '/ventas/nueva', icon: '🛒', label: 'Venta' },
        { href: '/clientes', icon: '👥', label: 'Clientes' },
        { href: '/ventas/historial', icon: '🧾', label: 'Historial' },
      ];

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-[#F8FAFC] dark:bg-gray-950 font-sans selection:bg-blue-100 selection:text-blue-700">

        {/* ── Overlay mobile backdrop ── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Drawer de navegación mobile ── */}
        <div className={`fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-50 transition-transform duration-300 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
                {role === 'admin' && NAV_ITEMS.admin.slice(0, 1).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
                {role === 'cajera' && NAV_ITEMS.cajera.slice(0, 1).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
              </div>
            </div>
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Ventas</p>
              <div className="space-y-1">
                {role === 'admin' && NAV_ITEMS.admin.slice(5, 7).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={() => setMobileOpen(false)} />
                ))}
                {role === 'cajera' && NAV_ITEMS.cajera.slice(1).map(item => (
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
                  {NAV_ITEMS.admin.slice(1, 5).map(item => (
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
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm font-bold"
            >
              <span>🚪</span> Cerrar Sesión
            </button>
          </div>
        </div>

        {/* ── Barra Lateral Desktop (sin cambios) ── */}
        <aside className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 hidden lg:flex flex-col z-30">
          {/* Logo / Marca */}
          <div className="h-20 flex items-center px-8 border-b border-gray-100 dark:border-gray-800">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl group-hover:rotate-6 transition-transform shadow-lg shadow-blue-200 dark:shadow-none">
                P
              </div>
              <span className="font-black text-xl tracking-tight text-gray-900 dark:text-white">
                POS<span className="text-blue-600">MASTER</span>
              </span>
            </Link>
          </div>

          {/* Navegación */}
          <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-8">
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Principal</p>
              <div className="space-y-1">
                {role === 'admin' && NAV_ITEMS.admin.slice(0, 1).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} />
                ))}
                {role === 'cajera' && NAV_ITEMS.cajera.slice(0, 1).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Ventas</p>
              <div className="space-y-1">
                {role === 'admin' && NAV_ITEMS.admin.slice(5, 7).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} />
                ))}
                {role === 'cajera' && NAV_ITEMS.cajera.slice(1).map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
            <div>
              <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Catálogos</p>
              <div className="space-y-1">
                {NAV_ITEMS.shared.map(item => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
            {role === 'admin' && (
              <div>
                <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Gestión</p>
                <div className="space-y-1">
                  {NAV_ITEMS.admin.slice(1, 5).map(item => (
                    <NavLink key={item.href} item={item} active={pathname === item.href} />
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* Footer del Sidebar (Perfil / Logout) */}
          <div className="p-4 bg-gray-50/50 dark:bg-gray-800/20 m-4 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.email}</p>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm font-bold group"
            >
              <span className="group-hover:rotate-12 transition-transform">🚪</span>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Contenido Principal */}
        <div className="lg:ml-72 flex-1 flex flex-col min-h-screen">

          {/* Header Superior */}
          <header className="h-16 lg:h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20 px-4 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:gap-4">
              {/* Botón hamburguesa — solo mobile */}
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Abrir menú"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {role}
              </div>
              <p className="hidden md:block text-sm text-gray-500 font-medium">
                {contextMessage}
              </p>
            </div>

            <div className="flex items-center gap-4 lg:gap-6">
              <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                <span className="text-xl">🔔</span>
              </button>
              <div className="h-8 w-px bg-gray-200 dark:bg-gray-800"></div>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Fecha Hoy</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
          </header>

          {/* Área de Página — pb-20 en mobile para no quedar bajo la barra inferior */}
          <main className="p-4 lg:p-8 flex-1 pb-24 lg:pb-8">
            {children}
          </main>
        </div>

        {/* ── Barra de navegación rápida inferior — solo mobile ── */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-30 lg:hidden safe-area-bottom">
          <div className="flex items-center justify-around px-2 py-2">
            {quickNavItems.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[60px] ${
                    isActive ? 'text-blue-600' : 'text-gray-400'
                  }`}
                >
                  <span className="text-2xl leading-none">{item.icon}</span>
                  <span className={`text-[9px] font-black uppercase tracking-wider ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {/* Botón menú completo */}
            <button
              onClick={() => setMobileOpen(true)}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-gray-400 min-w-[60px]"
            >
              <span className="text-2xl leading-none">☰</span>
              <span className="text-[9px] font-black uppercase tracking-wider">Más</span>
            </button>
          </div>
        </nav>

      </div>
    </AuthGuard>
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

