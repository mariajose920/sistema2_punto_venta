"use client";

import Link from 'next/link';
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Role } from '@/hooks/useAuth';
import LogoutButton from './LogoutButton';

const NAV_ITEMS = {
  shared: [
    { href: '/productos', label: 'Productos', icon: '📦' },
    { href: '/clientes', label: 'Clientes', icon: '👥' },
    { href: '/pedidos', label: 'Pedidos', icon: '📥' },
  ],
  admin: [
    { href: '/admin', label: 'Panel', icon: '📊' },
    { href: '/usuarios', label: 'Usuarios', icon: '👮' },
    { href: '/admin/calculadora', label: 'Calc', icon: '🧮' },
    { href: '/compras', label: 'Compras', icon: '📥' },
    { href: '/reportes', label: 'Reportes', icon: '📈' },
    { href: '/ventas/nueva', label: 'Venta', icon: '🛒' },
    { href: '/ventas/historial', label: 'Historial', icon: '🧾' },
  ],
  cajera: [
    { href: '/cajera', label: 'Inicio', icon: '🏠' },
    { href: '/ventas/nueva', label: 'Venta', icon: '🛒' },
    { href: '/ventas/historial', label: 'Historial', icon: '🧾' },
  ]
};

interface MobileNavProps {
  role: Role | null;
  user: User | null;
  pathname: string;
}

export default function MobileNav({ role, user, pathname }: MobileNavProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getItems = () => {
    if (role === 'admin') return [...NAV_ITEMS.admin, ...NAV_ITEMS.shared];
    if (role === 'cajera') return [...NAV_ITEMS.cajera, ...NAV_ITEMS.shared];
    return NAV_ITEMS.shared;
  };

  const items = getItems();
  // Mostrar solo los primeros 4 en la barra inferior
  const bottomItems = items.slice(0, 4);
  const allItems = items;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
      {/* Mobile Drawer Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setIsMenuOpen(false)} />
      )}
      
      <div
        className={`fixed bottom-20 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 transform transition-all duration-300 z-40 ${
          isMenuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="max-h-96 overflow-y-auto">
          {/* Perfil del usuario */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.email}</p>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">{role}</p>
              </div>
            </div>
            <LogoutButton />
          </div>

          {/* Todos los items de navegación */}
          <nav className="p-4 space-y-2">
            {allItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 font-semibold text-sm ${
                  pathname === item.href
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-around h-20 px-2">
        {bottomItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg transition-all duration-200 flex-1 ${
              pathname === item.href
                ? 'text-blue-600'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs mt-1 font-semibold text-center">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex flex-col items-center justify-center py-2 px-2 rounded-lg transition-all duration-200 flex-1 text-gray-600 dark:text-gray-400 hover:text-blue-600"
        >
          <span className="text-2xl">⋯</span>
          <span className="text-xs mt-1 font-semibold">Más</span>
        </button>
      </nav>
    </div>
  );
}
