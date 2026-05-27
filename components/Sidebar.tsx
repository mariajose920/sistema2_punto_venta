import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { Role } from '@/hooks/useAuth';
import LogoutButton from './LogoutButton';

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

interface SidebarProps {
  role: Role | null;
  user: User | null;
  pathname: string;
}

export default function Sidebar({ role, user, pathname }: SidebarProps) {
  return (
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
            {role === 'admin' && NAV_ITEMS.admin.slice(0, 2).map(item => (
              <SidebarNavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
            {role === 'cajera' && NAV_ITEMS.cajera.slice(0, 2).map(item => (
              <SidebarNavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </div>
        </div>
        <div>
          <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Ventas</p>
          <div className="space-y-1">
            {role === 'admin' && NAV_ITEMS.admin.slice(6, 8).map(item => (
              <SidebarNavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
            {role === 'cajera' && NAV_ITEMS.cajera.slice(2).map(item => (
              <SidebarNavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </div>
        </div>
        <div>
          <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Catálogos</p>
          <div className="space-y-1">
            {NAV_ITEMS.shared.map(item => (
              <SidebarNavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </div>
        </div>
        {role === 'admin' && (
          <div>
            <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Gestión</p>
            <div className="space-y-1">
              {NAV_ITEMS.admin.slice(2, 6).map(item => (
                <SidebarNavLink key={item.href} item={item} active={pathname === item.href} />
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
        <LogoutButton />
      </div>
    </aside>
  );
}

function SidebarNavLink({ item, active }: { item: any; active: boolean }) {
  return (
    <Link
      href={item.href}
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
