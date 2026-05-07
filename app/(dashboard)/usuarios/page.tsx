"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Usuario {
  id: string;
  email: string;
  rol: string;
  created_at: string;
}

interface UserMetrics {
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
}

interface Venta {
  id_venta: string;
  total_venta: number;
  fecha_venta: string;
  forma_pago: string;
}

export default function UsuariosPage() {
  const { role: currentRole, user: currentUser } = useAuth();
  
  // Estados
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [historial, setHistorial] = useState<Venta[]>([]);
  
  // Filtros
  const [fechaDesde, setFechaDesde] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);

  const fetchUsuarios = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('Usuario').select('*').order('rol');
      if (error) throw error;
      setUsuarios(data || []);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserStats = async (user: Usuario) => {
    setSelectedUser(user);
    setLoading(true);
    
    try {
      const { data, error } = await (supabase as any)
        .from('Venta')
        .select('id_venta, total_venta, fecha_venta, forma_pago')
        .eq('id_usuario_cajera', user.id)
        .gte('fecha_venta', fechaDesde)
        .lte('fecha_venta', `${fechaHasta}T23:59:59`)
        .order('fecha_venta', { ascending: false });

      if (error) throw error;

      const ventas = data as Venta[];
      const total = (ventas || []).reduce((acc, v) => acc + (v.total_venta || 0), 0);
      const cantidad = (ventas || []).length;
      
      setMetrics({
        totalVentas: total,
        cantidadVentas: cantidad,
        ticketPromedio: cantidad > 0 ? total / cantidad : 0
      });
      setHistorial(ventas || []);
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (userId === currentUser?.id) {
      alert('No puedes cambiar tu propio rol por seguridad.');
      return;
    }

    const { error } = await (supabase as any)
      .from('Usuario')
      .update({ rol: newRole })
      .eq('id', userId);

    if (error) alert('Error: ' + error.message);
    else {
      alert(`Rol actualizado a ${newRole}`);
      fetchUsuarios();
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, rol: newRole } as Usuario);
      }
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      alert('No puedes eliminar tu propia cuenta administrativa.');
      return;
    }

    if (window.confirm('¿Estás seguro de eliminar el acceso de este usuario? Esta acción solo lo elimina de la base de datos operativa, no de Supabase Auth.')) {
      const { error } = await (supabase as any).from('Usuario').delete().eq('id', userId);
      if (error) alert('Error: ' + error.message);
      else {
        alert('Usuario eliminado del sistema operativo.');
        setSelectedUser(null);
        fetchUsuarios();
      }
    }
  };

  useEffect(() => {
    if (currentRole === 'admin') fetchUsuarios();
  }, [currentRole, fetchUsuarios]);

  if (currentRole !== 'admin') {
    return <div className="p-12 text-center font-black text-red-500">ACCESO DENEGADO</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header Administrativo */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Perfiles y Permisos</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">Gestión Centralizada de Personal</p>
        </div>
        <div className="hidden md:block px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full">
          <span className="text-[10px] font-black text-blue-600 uppercase">Administrador Activo: {currentUser?.email}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Lado Izquierdo: Lista de Usuarios */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Usuarios en Sistema</h2>
          {loading && !selectedUser ? (
            <p className="p-8 text-center animate-pulse text-gray-400 font-bold">Cargando equipo...</p>
          ) : usuarios.map(u => (
            <button 
              key={u.id}
              onClick={() => fetchUserStats(u)}
              className={`w-full text-left p-6 rounded-[1.5rem] border-2 transition-all group ${selectedUser?.id === u.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-100 dark:shadow-none' : 'border-gray-50 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-gray-200'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-white shadow-md ${u.rol === 'admin' ? 'bg-purple-600' : 'bg-emerald-600'}`}>
                  {u.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{u.email}</p>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${u.rol === 'admin' ? 'text-purple-600' : 'text-emerald-600'}`}>{u.rol}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Lado Derecho: Gestión y Analítica */}
        <div className="lg:col-span-3 space-y-8">
          {selectedUser ? (
            <>
              {/* Acciones de Gestión de Perfil */}
              <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 duration-500">
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">Configuración de Acceso</h3>
                  <p className="text-sm text-gray-400 font-medium">Modifica los privilegios del usuario: {selectedUser.email}</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleUpdateRole(selectedUser.id, selectedUser.rol === 'admin' ? 'cajera' : 'admin')}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none"
                  >
                    Cambiar a {selectedUser.rol === 'admin' ? 'Cajera' : 'Admin'}
                  </button>
                  <button 
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    className="px-6 py-3 bg-red-50 text-red-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                  >
                    Revocar Acceso
                  </button>
                </div>
              </div>

              {/* Sección de Desempeño (Métricas) */}
              <div className="space-y-6">
                <div className="flex items-center gap-4 px-2">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Rendimiento en el Periodo</h3>
                  <div className="flex gap-2 text-xs font-bold bg-gray-50 dark:bg-gray-900 p-1.5 rounded-lg">
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer" />
                    <span>-</span>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard title="Ventas Acumuladas" value={`$${metrics?.totalVentas.toLocaleString()}`} icon="💰" />
                  <StatCard title="Tickets Emitidos" value={`${metrics?.cantidadVentas} ops.`} icon="🧾" />
                  <StatCard title="Ticket Promedio" value={`$${metrics?.ticketPromedio.toLocaleString(undefined, {maximumFractionDigits: 0})}`} icon="📊" />
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-gray-50 dark:border-gray-700">
                    <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Movimientos Registrados</h3>
                  </div>
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-8 py-5">Fecha / Hora</th>
                          <th className="px-8 py-5">Método</th>
                          <th className="px-8 py-5 text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {historial.map(v => (
                          <tr key={v.id_venta} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                            <td className="px-8 py-5">
                              <p className="font-bold text-gray-900 dark:text-white">{new Date(v.fecha_venta).toLocaleDateString()}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(v.fecha_venta).toLocaleTimeString()}</p>
                            </td>
                            <td className="px-8 py-5">
                              <span className="px-3 py-1 bg-gray-100 dark:bg-gray-900 rounded-full text-[9px] font-black uppercase tracking-tighter text-gray-500">
                                {v.forma_pago}
                              </span>
                            </td>
                            <td className="px-8 py-5 text-right font-black text-gray-900 dark:text-white">
                              ${v.total_venta.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center p-20 text-center bg-gray-50/20 dark:bg-gray-900/20 rounded-[3rem] border-4 border-dashed border-gray-100 dark:border-gray-800">
              <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-4xl mb-6 grayscale opacity-40 animate-bounce">👮</div>
              <h3 className="text-2xl font-black text-gray-300 uppercase tracking-[0.3em]">Gestión de Personal</h3>
              <p className="text-sm font-bold text-gray-300 mt-2">Selecciona un miembro del equipo para gestionar sus permisos o analizar su actividad.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


function StatCard({ title, value, icon }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 p-8 rounded-[1.5rem] border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
      <div className="flex justify-between items-center mb-2">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">{value}</p>
    </div>
  );
}
