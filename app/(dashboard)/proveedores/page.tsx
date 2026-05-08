"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { normalizeText, cleanRUT, logAction, validateRUT, formatRUT, formatCurrency } from '@/lib/utils';

interface Proveedor {
  id_proveedor: string;
  nombre_empresa: string;
  rut_empresa: string;
  telefono_: string;
  correo_: string;
  direccion: string;
}

interface Compra {
  id_compra: string;
  total_compra: number;
  fecha_compra: string;
}

export default function ProveedoresPage() {
  const { role, user, isMounted } = useAuth();

  // Estados de datos
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [filtered, setFiltered] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);

  // Formulario
  const [formData, setFormData] = useState<Partial<Proveedor>>({
    nombre_empresa: '',
    rut_empresa: '',
    telefono_: '',
    correo_: '',
    direccion: ''
  });

  const fetchProveedores = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('Proveedor').select('*').order('nombre_empresa');
      if (error) throw error;
      setProveedores(data || []);
      setFiltered(data || []);
    } catch (err) {
      console.error('Error cargando proveedores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isMounted && role === 'admin') fetchProveedores();
  }, [role, isMounted, fetchProveedores]);

  useEffect(() => {
    const term = normalizeText(search);
    const termClean = cleanRUT(search);
    setFiltered(proveedores.filter(p =>
      normalizeText(p.nombre_empresa).includes(term) ||
      cleanRUT(p.rut_empresa).includes(termClean)
    ));
  }, [search, proveedores]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      const nombreNorm = normalizeText(formData.nombre_empresa);
      const rutLimpio = cleanRUT(formData.rut_empresa);
      
      if (rutLimpio && !validateRUT(rutLimpio)) {
        alert('El RUT ingresado no es válido. Por favor verifique el dígito verificador.');
        setLoading(false);
        return;
      }

      const rutFormateado = rutLimpio ? formatRUT(rutLimpio) : '';

      // Verificar duplicado de NOMBRE
      const { data: nombreExistente } = await supabase
        .from('Proveedor')
        .select('id_proveedor')
        .eq('nombre_empresa', nombreNorm)
        .neq('id_proveedor', selectedProveedor?.id_proveedor || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (nombreExistente) {
        alert(`Ya existe un proveedor registrado con el nombre: "${nombreNorm}".`);
        setLoading(false);
        return;
      }

      // Verificar unicidad del RUT
      if (rutFormateado && rutFormateado !== selectedProveedor?.rut_empresa) {
        const { data: existente } = await supabase
          .from('Proveedor')
          .select('id_proveedor')
          .eq('rut_empresa', rutFormateado)
          .maybeSingle();

        if (existente) {
          alert('Ya existe un proveedor registrado con este RUT.');
          setLoading(false);
          return;
        }
      }

      const finalData = { 
        nombre_empresa: nombreNorm,
        rut_empresa: rutFormateado,
        telefono_: formData.telefono_ || '',
        correo_: normalizeText(formData.correo_),
        direccion: normalizeText(formData.direccion)
      };

      if (selectedProveedor?.id_proveedor) {
        const { error } = await (supabase.from('Proveedor') as any)
          .update(finalData)
          .eq('id_proveedor', selectedProveedor.id_proveedor);
        if (error) throw error;

        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'edicion',
          modulo: 'proveedores',
          detalle: `actualizó proveedor: ${nombreNorm}`
        });
      } else {
        const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        const { error } = await (supabase.from('Proveedor') as any).insert([{
            ...finalData,
            id_proveedor: newId
        }]);
        if (error) throw error;

        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'creacion',
          modulo: 'proveedores',
          detalle: `creó proveedor: ${nombreNorm}`
        });
      }
      setIsModalOpen(false);
      fetchProveedores();
      alert('Proveedor guardado correctamente');
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEliminar = async (id: string) => {
    const p = proveedores.find(x => x.id_proveedor === id);
    if (window.confirm(`¿Eliminar al proveedor "${p?.nombre_empresa.toUpperCase()}"?`)) {
      try {
        const { error } = await supabase.from('Proveedor').delete().eq('id_proveedor', id);
        if (error) throw error;

        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'eliminacion',
          modulo: 'proveedores',
          detalle: `eliminó proveedor: ${p?.nombre_empresa}`
        });

        fetchProveedores();
      } catch (err: any) {
        alert('Error al eliminar: ' + err.message);
      }
    }
  };

  const openHistory = async (p: Proveedor) => {
    setSelectedProveedor(p);
    setIsHistoryOpen(true);
    try {
      const { data, error } = await supabase
        .from('Compra')
        .select('id_compra, total_compra, fecha_compra')
        .eq('id_proveedor', p.id_proveedor)
        .order('fecha_compra', { ascending: false });
      if (error) throw error;
      setCompras(data || []);
    } catch (err) {
      console.error('Error cargando historial:', err);
    }
  };

  if (!isMounted || (loading && proveedores.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-8 border-blue-600/10 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="p-20 text-center bg-red-50 rounded-[4rem] m-10 border-4 border-dashed border-red-200">
        <h2 className="text-4xl font-black text-red-500 uppercase tracking-tighter italic">Acceso Restringido</h2>
        <p className="text-gray-500 font-bold mt-4 uppercase tracking-widest text-[10px]">Módulo exclusivo para gerencia administrativa</p>
        <Link href="/" className="mt-10 inline-block bg-gray-900 text-white px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95">Volver al Inicio</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">

      {/* Header Premium */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex-1 w-full">
            <div className="flex items-center gap-6 mb-6">
                <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-xl shadow-blue-100 dark:shadow-none">🚚</div>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase italic">Directorio de Proveedores</h1>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-1">Gestión de Alianzas y Abastecimiento</p>
                </div>
            </div>
          <div className="relative">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 grayscale opacity-30 text-2xl">🔍</span>
            <input
              type="text"
              placeholder="Buscar por razón social o RUT de empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-16 pr-6 py-5 bg-gray-50 dark:bg-gray-900 border-none rounded-[1.5rem] font-black text-sm italic placeholder:opacity-30 focus:ring-4 focus:ring-blue-600/10 transition-all uppercase"
            />
          </div>
        </div>
        <button
          onClick={() => { setSelectedProveedor(null); setFormData({ nombre_empresa: '', rut_empresa: '', telefono_: '', correo_: '', direccion: '' }); setIsModalOpen(true); }}
          className="bg-gray-900 hover:bg-blue-600 text-white px-12 py-6 rounded-[2rem] font-black shadow-2xl transition-all transform hover:scale-105 active:scale-95 uppercase tracking-widest text-xs"
        >
          + Nuevo Proveedor
        </button>
      </div>

      {/* Grid de Proveedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {filtered.map(p => (
          <div key={p.id_proveedor} className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-900/10 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-700"></div>
            
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white truncate uppercase italic tracking-tighter">{p.nombre_empresa}</h2>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mt-2 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full w-fit italic">
                    {p.rut_empresa || 'IDENTIFICACIÓN PENDIENTE'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openHistory(p)} className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm">📦</button>
                <button onClick={() => { setSelectedProveedor(p); setFormData(p); setIsModalOpen(true); }} className="p-4 bg-gray-50 dark:bg-gray-700 text-gray-400 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">✏️</button>
                <button onClick={() => handleEliminar(p.id_proveedor)} className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm">🗑️</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 border-t border-gray-50 dark:border-gray-700 pt-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-center text-lg">📞</div>
                <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Contacto Directo</p>
                    <p className="text-sm font-black text-gray-700 dark:text-gray-300 italic">{p.telefono_ || 'SIN REGISTRO'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-center text-lg">✉️</div>
                <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Correo Corporativo</p>
                    <p className="text-sm font-black text-gray-700 dark:text-gray-300 truncate lowercase">{p.correo_ || 'sin-correo@sistema.cl'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-center text-lg">📍</div>
                <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Casa Matriz / Bodega</p>
                    <p className="text-xs font-bold text-gray-400 truncate uppercase italic">{p.direccion || 'DIRECCIÓN NO ESPECIFICADA'}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="col-span-full py-40 text-center bg-gray-50/20 dark:bg-gray-900/20 rounded-[4rem] border-4 border-dashed border-gray-100 dark:border-gray-800 flex flex-col items-center">
            <span className="text-6xl grayscale opacity-20 mb-6">🏜️</span>
            <p className="text-gray-300 font-black uppercase tracking-[0.5em] text-xs italic">Sin resultados en el directorio</p>
          </div>
        )}
      </div>

      {/* Modal Proveedor Premium */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-xl rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-y-auto max-h-[90vh]">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-10 right-10 text-2xl opacity-20 hover:opacity-100 transition-all">✕</button>
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter uppercase">
              {selectedProveedor ? 'Editar Ficha' : 'Nueva Alianza'}
            </h2>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em] mb-12">Información Fiscal y de Contacto</p>

            <form onSubmit={handleSave} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">Razón Social de la Empresa</label>
                  <input required value={formData.nombre_empresa} onChange={e => setFormData({ ...formData, nombre_empresa: e.target.value })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-xl italic tracking-tight" placeholder="Ej: Distribuidora Norte SpA" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">RUT Empresa</label>
                  <input value={formData.rut_empresa} onChange={e => setFormData({ ...formData, rut_empresa: e.target.value })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-lg tracking-widest" placeholder="77.123.456-K" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">Teléfono de Enlace</label>
                  <input value={formData.telefono_} onChange={e => setFormData({ ...formData, telefono_: e.target.value })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-lg" placeholder="+56 9..." />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">Email Corporativo</label>
                  <input type="email" value={formData.correo_} onChange={e => setFormData({ ...formData, correo_: e.target.value })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-lg lowercase" placeholder="ventas@empresa.com" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">Dirección de Operaciones</label>
                  <input value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-sm uppercase italic" placeholder="Calle #123, Ciudad, Región" />
                </div>
              </div>
              <div className="flex gap-6 pt-10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px] tracking-widest">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[3] py-6 bg-blue-600 text-white font-black rounded-[2rem] shadow-2xl shadow-blue-200 dark:shadow-none hover:bg-blue-500 transition-all uppercase tracking-[0.3em] text-xs">
                  {loading ? 'SINCRONIZANDO...' : 'GUARDAR PROVEEDOR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial de Compras Premium */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-[4rem] p-12 shadow-2xl max-h-[85vh] overflow-auto animate-in zoom-in-95 duration-300 relative">
            <button onClick={() => setIsHistoryOpen(false)} className="absolute top-12 right-12 w-14 h-14 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-2xl hover:rotate-90 transition-all shadow-sm">✕</button>
            
            <div className="mb-12">
                <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic uppercase">Cronología de Abastecimiento</h2>
                <p className="text-emerald-600 font-black uppercase text-[10px] tracking-[0.5em] mt-2 italic border-l-4 border-emerald-600 pl-4">
                    {selectedProveedor?.nombre_empresa}
                </p>
            </div>

            <div className="space-y-6">
              {compras.map(c => (
                <div key={c.id_compra} className="p-8 bg-gray-50 dark:bg-gray-900/50 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6 group hover:border-emerald-500/30 hover:bg-white dark:hover:bg-gray-800 transition-all shadow-sm">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl">🧾</div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1 italic">
                            FACTURADO EL: {new Date(c.fecha_compra).toLocaleDateString()} • {new Date(c.fecha_compra).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest font-mono">ID: {c.id_compra.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic group-hover:text-emerald-600 transition-colors">
                        ${formatCurrency(c.total_compra)}
                    </p>
                    <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-1">Sincronizado con Caja</p>
                  </div>
                </div>
              ))}
              {compras.length === 0 && (
                <div className="text-center py-32 flex flex-col items-center">
                    <div className="text-6xl opacity-10 mb-6 grayscale">📊</div>
                    <p className="text-gray-300 font-black uppercase tracking-[0.5em] text-[10px] italic">Sin registros de facturación detectados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
