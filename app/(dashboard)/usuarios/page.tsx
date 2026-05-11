"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, formatCurrency } from '@/lib/utils';
import { Database } from '@/types/database.types';

type UsuarioRow = Database['public']['Tables']['Usuario']['Row'];
type VentaRow = Database['public']['Tables']['Venta']['Row'];

interface UserMetrics {
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
}

export default function UsuariosPage() {
  const { role: currentRole, user: currentUser } = useAuth();
  
  // Estados
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UsuarioRow | null>(null);
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [historial, setHistorial] = useState<VentaRow[]>([]);
  const [search, setSearch] = useState('');
  
  // Estados para Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    id: '',
    email: '',
    nombre: '',
    apellido: '',
    rol: 'cajera' as UsuarioRow['rol'],
    activo: true
  });

  // Filtros
  const [fechaDesde, setFechaDesde] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);

  const fetchUsuarios = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase.from('Usuario') as any)
        .select('*')
        .order('rol');
      if (error) throw error;
      setUsuarios(data || []);
    } catch (err: unknown) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserStats = useCallback(async (user: UsuarioRow) => {
    setSelectedUser(user);
    setLoading(true);
    
    try {
      const { data, error } = await (supabase.from('Venta') as any)
        .select('id_venta, total_venta, fecha_venta, forma_pago')
        .eq('id_usuario_cajera', user.id)
        .gte('fecha_venta', fechaDesde)
        .lte('fecha_venta', `${fechaHasta}T23:59:59`)
        .order('fecha_venta', { ascending: false });

      if (error) throw error;

      const ventas = (data as VentaRow[]) || [];
      const total = ventas.reduce((acc, v) => acc + (v.total_venta || 0), 0);
      const cantidad = ventas.length;
      
      setMetrics({
        totalVentas: total,
        cantidadVentas: cantidad,
        ticketPromedio: cantidad > 0 ? total / cantidad : 0
      });
      setHistorial(ventas);
    } catch (err: unknown) {
      console.error('Error cargando estadísticas:', err);
    } finally {
      setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload = {
        nombre: normalizeText(formData.nombre),
        apellido: normalizeText(formData.apellido),
        rol: formData.rol,
        activo: formData.activo
      };

      if (modalMode === 'create') {
        const { error } = await (supabase.from('Usuario') as any).insert([{
          id: formData.id || undefined,
          email: formData.email.toLowerCase(),
          ...payload
        }]);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('Usuario') as any).update(payload).eq('id', formData.id);
        if (error) throw error;
      }
      
      setIsModalOpen(false);
      fetchUsuarios();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar usuario';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (user: UsuarioRow) => {
    if (user.id === currentUser?.id) {
      alert('No puedes deshabilitar tu propia cuenta.');
      return;
    }

    const { error } = await (supabase.from('Usuario') as any)
      .update({ activo: !user.activo })
      .eq('id', user.id);

    if (error) alert('Error: ' + error.message);
    else {
      fetchUsuarios();
      if (selectedUser?.id === user.id) {
        setSelectedUser({...user, activo: !user.activo});
      }
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      alert('No puedes eliminar tu propia cuenta administrativa.');
      return;
    }

    if (window.confirm('¿Estás seguro de eliminar este acceso? El usuario no podrá operar en el sistema.')) {
      const { error } = await (supabase.from('Usuario') as any).delete().eq('id', userId);
      if (error) alert('Error: ' + error.message);
      else {
        setSelectedUser(null);
        fetchUsuarios();
      }
    }
  };

  const filteredUsers = useMemo(() => {
    const term = normalizeText(search);
    return usuarios.filter(u => 
      normalizeText(u.nombre || '').includes(term) || 
      normalizeText(u.apellido || '').includes(term) || 
      u.email.toLowerCase().includes(term)
    );
  }, [usuarios, search]);

  useEffect(() => {
    if (currentRole === 'admin') fetchUsuarios();
  }, [currentRole, fetchUsuarios]);

  if (currentRole !== 'admin') {
    return <div className="p-20 text-center font-black text-red-500 uppercase tracking-[0.5em] animate-pulse">Acceso Denegado</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header Administrativo */}
      <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic">Personal & Roles</h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2 opacity-60 italic">Gestión Centralizada de Operaciones</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar por nombre o correo..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-600/10 transition-all"
            />
          </div>
          <button 
            onClick={() => {
              setModalMode('create');
              setFormData({ id: '', email: '', nombre: '', apellido: '', rol: 'cajera', activo: true });
              setIsModalOpen(true);
            }}
            className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-2xl active:scale-95"
          >
            + Nuevo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Lado Izquierdo: Lista de Usuarios */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">Equipo Operativo</h2>
          <div className="space-y-3 max-h-[700px] overflow-auto pr-2 custom-scrollbar">
            {loading && !selectedUser ? (
              <p className="p-10 text-center animate-pulse text-gray-400 font-black text-xs uppercase tracking-widest">Sincronizando...</p>
            ) : filteredUsers.map(u => (
              <button 
                key={u.id}
                onClick={() => fetchUserStats(u)}
                className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all relative overflow-hidden group ${!u.activo ? 'opacity-40 grayscale' : ''} ${selectedUser?.id === u.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/10 shadow-xl' : 'border-transparent bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm'}`}
              >
                <div className="flex items-center gap-4 relative z-10">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shadow-lg text-lg ${u.rol === 'admin' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                    {u.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-900 dark:text-white text-sm uppercase italic truncate">{u.nombre ? `${u.nombre} ${u.apellido || ''}` : u.email.split('@')[0]}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${u.rol === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>{u.rol}</span>
                      {!u.activo && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-red-50 text-red-600 rounded-full">Inactivo</span>}
                    </div>
                  </div>
                </div>
                {selectedUser?.id === u.id && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600" />}
              </button>
            ))}
          </div>
        </div>

        {/* Lado Derecho: Gestión y Analítica */}
        <div className="lg:col-span-3 space-y-8">
          {selectedUser ? (
            <div className="animate-in slide-in-from-right-10 duration-500">
              {/* Acciones de Gestión de Perfil */}
              <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-8 mb-8">
                <div className="flex items-center gap-8">
                   <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black text-white shadow-2xl ${selectedUser.rol === 'admin' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                    {selectedUser.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white uppercase italic tracking-tighter">{selectedUser.nombre ? `${selectedUser.nombre} ${selectedUser.apellido || ''}` : 'Usuario Genérico'}</h3>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">{selectedUser.email} • <span className="text-blue-600">{selectedUser.rol.toUpperCase()}</span></p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button 
                    onClick={() => {
                      setModalMode('edit');
                      setFormData({ 
                        id: selectedUser.id, 
                        email: selectedUser.email, 
                        nombre: selectedUser.nombre || '', 
                        apellido: selectedUser.apellido || '', 
                        rol: selectedUser.rol as UsuarioRow['rol'], 
                        activo: selectedUser.activo 
                      });
                      setIsModalOpen(true);
                    }}
                    className="px-6 py-4 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all shadow-sm"
                  >
                    ✏️ Editar
                  </button>
                  <button 
                    onClick={() => handleToggleStatus(selectedUser)}
                    className={`px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm ${selectedUser.activo ? 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
                  >
                    {selectedUser.activo ? 'Suspender' : 'Reactivar'}
                  </button>
                  <button 
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>

              {/* Sección de Desempeño */}
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Rendimiento Operativo</h3>
                  <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-50 dark:border-gray-700">
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Desde</span>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-black text-blue-600 focus:ring-0 cursor-pointer" />
                    <span className="text-gray-300 mx-2">→</span>
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Hasta</span>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-black text-blue-600 focus:ring-0 cursor-pointer" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <StatCard title="Ventas Totales" value={formatCurrency(metrics?.totalVentas || 0)} icon="💰" color="text-gray-900 dark:text-white" />
                  <StatCard title="Total Tickets" value={`${metrics?.cantidadVentas || 0} U.`} icon="🧾" color="text-blue-600" />
                  <StatCard title="Ticket Promedio" value={formatCurrency(metrics?.ticketPromedio || 0)} icon="📊" color="text-emerald-600" />
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/20 dark:bg-gray-900/10 flex justify-between items-center">
                    <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Auditoría de Movimientos</h3>
                    <span className="text-[9px] font-black text-gray-400 uppercase opacity-50">Cajero ID: {selectedUser.id.slice(0,8)}</span>
                  </div>
                  <div className="max-h-[500px] overflow-auto custom-scrollbar">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] sticky top-0">
                        <tr>
                          <th className="px-10 py-6">Fecha / Hora</th>
                          <th className="px-10 py-6">Método de Pago</th>
                          <th className="px-10 py-6 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {historial.length === 0 ? (
                          <tr><td colSpan={3} className="p-32 text-center text-gray-300 font-black uppercase tracking-widest italic opacity-40">Sin actividad en el periodo</td></tr>
                        ) : historial.map(v => (
                          <tr key={v.id_venta} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                            <td className="px-10 py-6">
                              <p className="font-black text-gray-900 dark:text-white text-sm">{new Date(v.fecha_venta).toLocaleDateString()}</p>
                              <p className="text-[9px] text-gray-400 font-black uppercase mt-1 tracking-widest">{new Date(v.fecha_venta).toLocaleTimeString()}</p>
                            </td>
                            <td className="px-10 py-6">
                              <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm ${v.forma_pago === 'efectivo' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {v.forma_pago}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-right font-black text-gray-900 dark:text-white text-xl tracking-tighter">
                              {formatCurrency(v.total_venta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[700px] flex flex-col items-center justify-center p-20 text-center bg-white dark:bg-gray-800 rounded-[4rem] border border-gray-100 dark:border-gray-700 shadow-sm animate-in fade-in duration-700">
              <div className="w-32 h-32 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] flex items-center justify-center text-5xl mb-8 grayscale opacity-30">👥</div>
              <h3 className="text-4xl font-black text-gray-200 uppercase tracking-[0.4em] italic">Equipo & Roles</h3>
              <p className="text-xs font-bold text-gray-300 mt-6 max-w-sm uppercase leading-relaxed tracking-widest opacity-50">Selecciona un colaborador para supervisar sus métricas, permisos y actividad reciente en el sistema.</p>
            </div>
          )}
        </div>

      </div>

      {/* Modal de Usuario Premium */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter">
              {modalMode === 'create' ? 'Nuevo Acceso' : 'Perfil Operativo'}
            </h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-10">Credenciales del Sistema</p>

            <form onSubmit={handleSaveUser} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Nombre</label>
                  <input required value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold uppercase italic" placeholder="Juan" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Apellido</label>
                  <input required value={formData.apellido || ''} onChange={e => setFormData({...formData, apellido: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold uppercase italic" placeholder="Pérez" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Identificador (Auth Email)</label>
                <input 
                  required 
                  disabled={modalMode === 'edit'}
                  type="email" 
                  value={formData.email || ''} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className={`w-full p-5 rounded-2xl border-none font-black text-blue-600 ${modalMode === 'edit' ? 'bg-gray-100 opacity-50 cursor-not-allowed' : 'bg-gray-50 dark:bg-gray-900'}`} 
                  placeholder="usuario@sistema.cl" 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Rango Operativo</label>
                  <select value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value as UsuarioRow['rol']})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-[10px] uppercase tracking-widest appearance-none">
                    <option value="cajera">Cajero/a</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Vigencia</label>
                  <select value={formData.activo ? 'true' : 'false'} onChange={e => setFormData({...formData, activo: e.target.value === 'true'})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-[10px] uppercase tracking-widest appearance-none">
                    <option value="true">Activo</option>
                    <option value="false">Bloqueado</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px] tracking-widest">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-6 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:bg-black transition-all uppercase tracking-widest text-xs active:scale-95">
                  {loading ? 'Sincronizando...' : modalMode === 'create' ? 'Dar de Alta' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: string;
  color?: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-2xl group relative overflow-hidden">
      <div className="flex justify-between items-center mb-6 relative z-10">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{title}</p>
        <div className="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">{icon}</div>
      </div>
      <p className={`text-3xl font-black ${color || 'text-gray-900 dark:text-white'} tracking-tighter relative z-10`}>{value}</p>
      <div className="absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:opacity-10 transition-opacity grayscale">{icon}</div>
    </div>
  );
}
