"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, logAction, formatCurrency } from '@/lib/utils';

/* 
SQL REQUERIDO PARA LA TABLA Usuario:
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN DEFAULT true;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "nombre" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "apellido" TEXT;
*/

interface Usuario {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  activo: boolean;
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
  
  // Estados para Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    id: '',
    email: '',
    nombre: '',
    apellido: '',
    rol: 'cajera' as 'admin' | 'cajera',
    activo: true
  });

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

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const emailNorm = formData.email.toLowerCase().trim();
      const nombreNorm = normalizeText(formData.nombre);
      const apellidoNorm = normalizeText(formData.apellido);

      if (modalMode === 'create') {
        const { error } = await (supabase as any).from('Usuario').insert([{
          id: formData.id || undefined, 
          email: emailNorm,
          nombre: nombreNorm,
          apellido: apellidoNorm,
          rol: formData.rol,
          activo: formData.activo
        }]);
        if (error) throw error;
        
        await logAction(supabase, {
          usuario_id: currentUser?.id || '',
          email_usuario: currentUser?.email || '',
          accion: 'creacion',
          modulo: 'usuarios',
          detalle: `creó usuario: ${emailNorm} (${formData.rol})`
        });

        alert('Usuario registrado exitosamente.');
      } else {
        const { error } = await (supabase as any).from('Usuario').update({
          nombre: nombreNorm,
          apellido: apellidoNorm,
          rol: formData.rol,
          activo: formData.activo
        }).eq('id', formData.id);
        if (error) throw error;

        await logAction(supabase, {
          usuario_id: currentUser?.id || '',
          email_usuario: currentUser?.email || '',
          accion: 'edicion',
          modulo: 'usuarios',
          detalle: `actualizó perfil de: ${emailNorm}`
        });

        alert('Perfil actualizado.');
      }
      setIsModalOpen(false);
      fetchUsuarios();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (user: Usuario) => {
    if (user.id === currentUser?.id) {
      alert('No puedes deshabilitar tu propia cuenta.');
      return;
    }

    try {
      const nuevoEstado = !user.activo;
      const { error } = await (supabase as any)
        .from('Usuario')
        .update({ activo: nuevoEstado })
        .eq('id', user.id);

      if (error) throw error;

      await logAction(supabase, {
        usuario_id: currentUser?.id || '',
        email_usuario: currentUser?.email || '',
        accion: 'edicion',
        modulo: 'usuarios',
        detalle: `${nuevoEstado ? 'activó' : 'deshabilitó'} al usuario: ${user.email}`
      });

      alert(`Usuario ${nuevoEstado ? 'activado' : 'deshabilitado'}`);
      fetchUsuarios();
      if (selectedUser?.id === user.id) setSelectedUser({...user, activo: nuevoEstado});
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      alert('No puedes eliminar tu propia cuenta.');
      return;
    }

    if (window.confirm('¿Estás seguro de eliminar este acceso?')) {
      try {
        const targetEmail = usuarios.find(u => u.id === userId)?.email || userId;
        const { error } = await (supabase as any).from('Usuario').delete().eq('id', userId);
        if (error) throw error;

        await logAction(supabase, {
          usuario_id: currentUser?.id || '',
          email_usuario: currentUser?.email || '',
          accion: 'eliminacion',
          modulo: 'usuarios',
          detalle: `eliminó acceso de: ${targetEmail}`
        });

        alert('Usuario eliminado.');
        setSelectedUser(null);
        fetchUsuarios();
      } catch (err: any) {
        alert('Error: ' + err.message);
      }
    }
  };

  useEffect(() => {
    if (currentRole === 'admin') fetchUsuarios();
  }, [currentRole, fetchUsuarios]);

  if (currentRole !== 'admin') {
    return <div className="p-20 text-center font-black text-red-500 bg-red-50 rounded-[3rem] m-10 border-4 border-dashed border-red-200 uppercase tracking-[0.5em]">Acceso Administrativo Requerido</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      
      {/* Header Premium */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-xl shadow-indigo-200 dark:shadow-none">👥</div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Gestión de Equipo</h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-1 italic">Control de Accesos y Auditoría de Ventas</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setModalMode('create');
            setFormData({ id: '', email: '', nombre: '', apellido: '', rol: 'cajera', activo: true });
            setIsModalOpen(true);
          }}
          className="px-10 py-5 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl"
        >
          + Agregar Colaborador
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Lado Izquierdo: Lista con Scroll */}
        <div className="lg:col-span-1 space-y-4 max-h-[800px] overflow-auto pr-2 custom-scrollbar">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 mb-4 border-l-4 border-indigo-600">Nómina del Sistema</h2>
          {loading && usuarios.length === 0 ? (
            <div className="p-10 text-center animate-pulse text-gray-400 font-black uppercase tracking-widest text-[10px]">Cargando Staff...</div>
          ) : usuarios.map(u => (
            <button 
              key={u.id}
              onClick={() => fetchUserStats(u)}
              className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all relative overflow-hidden group ${!u.activo ? 'opacity-40 grayscale' : ''} ${selectedUser?.id === u.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-transparent bg-white dark:bg-gray-800 hover:border-gray-200'}`}
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-white ${u.rol === 'admin' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                  {(u.nombre || u.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-gray-900 dark:text-white text-sm truncate uppercase italic tracking-tight">
                    {u.nombre ? `${u.nombre} ${u.apellido || ''}` : u.email.split('@')[0]}
                  </p>
                  <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${u.rol === 'admin' ? 'text-indigo-600' : 'text-emerald-600'}`}>{u.rol}</p>
                </div>
              </div>
              {!u.activo && <span className="absolute top-2 right-4 text-[8px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase italic">Bloqueado</span>}
            </button>
          ))}
        </div>

        {/* Lado Derecho: Dashboard de Usuario */}
        <div className="lg:col-span-3 space-y-8">
          {selectedUser ? (
            <>
              {/* Card de Usuario Seleccionado */}
              <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-8 animate-in slide-in-from-right-10 duration-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 dark:bg-indigo-900/10 rounded-full -mr-32 -mt-32"></div>
                <div className="flex items-center gap-8 relative">
                   <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black text-white shadow-2xl ${selectedUser.rol === 'admin' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                    {(selectedUser.nombre || selectedUser.email).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white uppercase italic tracking-tighter">
                        {selectedUser.nombre ? `${selectedUser.nombre} ${selectedUser.apellido || ''}` : 'Usuario del Sistema'}
                    </h3>
                    <p className="text-xs text-gray-400 font-black uppercase tracking-[0.3em] mt-1">{selectedUser.email}</p>
                    <div className="flex gap-2 mt-4">
                        <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${selectedUser.rol === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>{selectedUser.rol}</span>
                        <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${selectedUser.activo ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{selectedUser.activo ? 'Activo' : 'Inactivo'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 relative">
                  <button 
                    onClick={() => {
                      setModalMode('edit');
                      setFormData({ 
                        id: selectedUser.id, 
                        email: selectedUser.email, 
                        nombre: selectedUser.nombre || '', 
                        apellido: selectedUser.apellido || '', 
                        rol: selectedUser.rol as any, 
                        activo: selectedUser.activo 
                      });
                      setIsModalOpen(true);
                    }}
                    className="p-5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl hover:bg-gray-900 hover:text-white transition-all shadow-sm"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleToggleStatus(selectedUser)}
                    className={`px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedUser.activo ? 'bg-amber-100 text-amber-600 hover:bg-amber-600 hover:text-white' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
                  >
                    {selectedUser.activo ? 'Suspender' : 'Reactivar'}
                  </button>
                  <button 
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    className="p-5 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Métricas de Rendimiento */}
              <div className="space-y-6">
                <div className="flex items-center justify-between px-4">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">Rendimiento Operativo</h3>
                  <div className="flex gap-4 items-center bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase focus:ring-0 cursor-pointer" />
                    <span className="text-gray-300 text-xs">➔</span>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase focus:ring-0 cursor-pointer" />
                    <button onClick={() => fetchUserStats(selectedUser)} className="bg-indigo-600 text-white p-2 rounded-xl text-[10px]">🔄</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <StatCard title="Total Recaudado" value={`$${formatCurrency(metrics?.totalVentas || 0)}`} icon="💵" color="text-emerald-600" />
                  <StatCard title="Ventas Realizadas" value={`${metrics?.cantidadVentas || 0}`} icon="🛒" color="text-blue-600" />
                  <StatCard title="Ticket Promedio" value={`$${formatCurrency(metrics?.ticketPromedio || 0)}`} icon="📈" color="text-indigo-600" />
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm relative">
                  <div className="p-8 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">Registro de Actividad en Caja</h3>
                  </div>
                  <div className="max-h-[500px] overflow-auto custom-scrollbar">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] sticky top-0 z-10">
                        <tr>
                          <th className="px-10 py-6">Fecha y Hora</th>
                          <th className="px-10 py-6">Tipo Pago</th>
                          <th className="px-10 py-6 text-right">Total Operación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {historial.length === 0 ? (
                          <tr><td colSpan={3} className="py-32 text-center text-gray-300 font-black uppercase tracking-widest italic opacity-50">Sin actividad financiera</td></tr>
                        ) : historial.map(v => (
                          <tr key={v.id_venta} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all group">
                            <td className="px-10 py-6">
                              <p className="font-black text-gray-900 dark:text-white uppercase italic">{new Date(v.fecha_venta).toLocaleDateString()}</p>
                              <p className="text-[10px] text-gray-400 font-bold">{new Date(v.fecha_venta).toLocaleTimeString()}</p>
                            </td>
                            <td className="px-10 py-6">
                              <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${v.forma_pago === 'efectivo' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                                {v.forma_pago}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-right font-black text-gray-900 dark:text-white text-xl tracking-tighter">
                              ${formatCurrency(v.total_venta)}
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
            <div className="h-[700px] flex flex-col items-center justify-center p-20 text-center bg-gray-50/10 dark:bg-gray-900/10 rounded-[4rem] border-4 border-dashed border-gray-100 dark:border-gray-800/50">
              <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-5xl mb-8 grayscale opacity-30 animate-bounce">👥</div>
              <h3 className="text-4xl font-black text-gray-200 uppercase tracking-[0.5em] italic">Panel de Personal</h3>
              <p className="text-sm font-bold text-gray-300 mt-6 max-w-md leading-relaxed">Selecciona un colaborador de la lista para visualizar sus métricas de rendimiento, gestionar sus accesos y auditar sus operaciones en tiempo real.</p>
            </div>
          )}
        </div>

      </div>

      {/* Modal Formulario */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-10 right-10 text-2xl opacity-20 hover:opacity-100 transition-all">✕</button>
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter uppercase">
              {modalMode === 'create' ? 'Alta de Equipo' : 'Perfil de Usuario'}
            </h2>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-12">Seguridad y Permisos de Operación</p>

            <form onSubmit={handleSaveUser} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Nombre</label>
                  <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg italic" placeholder="Ej: Juan" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Apellido</label>
                  <input required value={formData.apellido} onChange={e => setFormData({...formData, apellido: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg italic" placeholder="Ej: Pérez" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Correo Electrónico Oficial</label>
                <input 
                  required 
                  disabled={modalMode === 'edit'}
                  type="email" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className={`w-full p-5 rounded-2xl border-none font-black text-xl tracking-tight ${modalMode === 'edit' ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50' : 'bg-gray-50 dark:bg-gray-900 text-indigo-600'}`} 
                  placeholder="usuario@sistema.com" 
                />
              </div>

              {modalMode === 'create' && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 italic">ID de Supabase Auth (UUID)</label>
                  <input value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-mono text-[10px] uppercase opacity-70" placeholder="00000000-0000-0000-0000-000000000000" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Rol Asignado</label>
                  <select value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value as any})} className="w-full p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border-none font-black text-xs uppercase tracking-[0.2em] text-indigo-600">
                    <option value="cajera">Cajera / Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Nivel de Acceso</label>
                  <select value={formData.activo ? 'true' : 'false'} onChange={e => setFormData({...formData, activo: e.target.value === 'true'})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xs uppercase tracking-[0.2em]">
                    <option value="true">Operativo (On)</option>
                    <option value="false">Bloqueado (Off)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase tracking-widest text-[10px]">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[3] py-6 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:bg-indigo-600 transition-all uppercase tracking-[0.3em] text-xs">
                  {loading ? 'SINCRONIZANDO...' : modalMode === 'create' ? 'CONFIRMAR ALTA' : 'GUARDAR CAMBIOS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 p-10 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-2xl hover:-translate-y-2 group">
      <div className="flex justify-between items-center mb-6">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] italic">{title}</p>
        <span className="text-3xl group-hover:scale-125 transition-transform duration-500 opacity-50">{icon}</span>
      </div>
      <p className={`text-4xl font-black ${color || 'text-gray-900 dark:text-white'} tracking-tighter italic`}>{value}</p>
    </div>
  );
}
