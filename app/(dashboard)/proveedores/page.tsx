"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Database } from '@/types/database.types';
import { normalizeText } from '@/lib/utils';

type ProveedorRow = Database['public']['Tables']['Proveedor']['Row'];
type CompraRow = Database['public']['Tables']['Compra']['Row'];

export default function ProveedoresPage() {
  const { role, isMounted } = useAuth();

  // Estados de datos
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [filtered, setFiltered] = useState<ProveedorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<ProveedorRow | null>(null);
  const [compras, setCompras] = useState<CompraRow[]>([]);

  // Formulario
  const [formData, setFormData] = useState<Partial<ProveedorRow>>({
    nombre_empresa: '',
    rut_empresa: '',
    telefono_: '',
    correo_: '',
    direccion: ''
  });

  const fetchProveedores = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase.from('Proveedor') as any).select('*').order('nombre_empresa');
      if (error) throw error;
      setProveedores(data || []);
      setFiltered(data || []);
    } catch (err: unknown) {
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
    setFiltered(proveedores.filter(p =>
      normalizeText(p.nombre_empresa || '').includes(term) ||
      (p.rut_empresa || '').toLowerCase().includes(term)
    ));
  }, [search, proveedores]);

  // Utilidades de RUT (Consistente con Clientes)
  const cleanRUT = (rut: string) => (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

  const validateRUT = (rut: string) => {
    const clean = cleanRUT(rut);
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body.charAt(i)) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const expectedDV = 11 - (sum % 11);
    const finalDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();
    return dv === finalDV;
  };

  const formatRUT = (rut: string) => {
    const clean = cleanRUT(rut);
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let formattedBody = '';
    for (let i = body.length - 1, j = 1; i >= 0; i--, j++) {
      formattedBody = body.charAt(i) + formattedBody;
      if (j % 3 === 0 && i !== 0) formattedBody = '.' + formattedBody;
    }
    return `${formattedBody}-${dv}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      const nombreNorm = normalizeText(formData.nombre_empresa || '');
      const rutLimpio = cleanRUT(formData.rut_empresa || '');
      
      if (rutLimpio && !validateRUT(rutLimpio)) {
        alert('El RUT ingresado no es válido. Por favor verifique el dígito verificador.');
        setLoading(false);
        return;
      }

      const rutFormateado = formatRUT(rutLimpio);

      // Verificar duplicado de NOMBRE
      const { data: nombreExistente } = await (supabase.from('Proveedor') as any)
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
        const { data: existente } = await (supabase.from('Proveedor') as any)
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
        telefono_: (formData.telefono_ || '').trim(),
        correo_: (formData.correo_ || '').trim().toLowerCase(),
        direccion: normalizeText(formData.direccion || '')
      };

      if (selectedProveedor?.id_proveedor) {
        const { error } = await (supabase.from('Proveedor') as any)
          .update(finalData)
          .eq('id_proveedor', selectedProveedor.id_proveedor);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('Proveedor') as any)
          .insert([finalData]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchProveedores();
      alert('Proveedor guardado correctamente');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleEliminar = async (id: string) => {
    if (window.confirm('¿Eliminar este proveedor? Se perderá el vínculo con compras pasadas.')) {
      try {
        const { error } = await (supabase.from('Proveedor') as any).delete().eq('id_proveedor', id);
        if (error) throw error;
        fetchProveedores();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al eliminar';
        alert('Error: ' + message);
      }
    }
  };

  const openHistory = async (p: ProveedorRow) => {
    setSelectedProveedor(p);
    setIsHistoryOpen(true);
    try {
      const { data, error } = await (supabase.from('Compra') as any)
        .select('*')
        .eq('id_proveedor', p.id_proveedor)
        .order('fecha_compra', { ascending: false });
      if (error) throw error;
      setCompras(data || []);
    } catch (err: unknown) {
      console.error('Error cargando historial:', err);
    }
  };

  if (!isMounted || (loading && proveedores.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="p-12 text-center">
        <h2 className="text-2xl font-black text-red-500 uppercase italic">Acceso Restringido</h2>
        <p className="text-gray-500 font-bold mt-2">Solo los administradores pueden gestionar proveedores.</p>
        <Link href="/" className="mt-6 inline-block bg-gray-900 text-white px-8 py-3 rounded-xl font-bold uppercase text-xs">Volver</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex-1 w-full">
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Directorio Proveedores</h1>
          <div className="relative mt-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 grayscale opacity-50 text-xl">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre de empresa o RUT/NIT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-600/10 transition-all"
            />
          </div>
        </div>
        <button
          onClick={() => { 
            setSelectedProveedor(null); 
            setFormData({ nombre_empresa: '', rut_empresa: '', telefono_: '', correo_: '', direccion: '' }); 
            setIsModalOpen(true); 
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-blue-200 dark:shadow-none transition-all transform hover:scale-105 active:scale-95"
        >
          Nuevo Proveedor
        </button>
      </div>

      {/* Grid de Proveedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filtered.map(p => (
          <div key={p.id_proveedor} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-gray-900 dark:text-white truncate uppercase">{p.nombre_empresa}</h2>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mt-1">{p.rut_empresa || 'Sin Identificación'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openHistory(p)} className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">📦 Compras</button>
                <button onClick={() => { setSelectedProveedor(p); setFormData(p); setIsModalOpen(true); }} className="p-2.5 bg-gray-50 dark:bg-gray-700 text-gray-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all">✏️</button>
                <button onClick={() => handleEliminar(p.id_proveedor)} className="p-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all">🗑️</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-gray-50 dark:border-gray-700 pt-6">
              <div className="flex items-center gap-3">
                <span className="text-lg">📞</span>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{p.telefono_ || 'Sin teléfono'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg">✉️</span>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate lowercase">{p.correo_}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg">📍</span>
                <p className="text-xs text-gray-400 font-medium truncate uppercase">{p.direccion}</p>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="col-span-full p-20 text-center bg-gray-50/50 dark:bg-gray-900/20 rounded-[3rem] border-2 border-dashed border-gray-100 dark:border-gray-800">
            <p className="text-gray-400 font-bold italic">No se encontraron proveedores que coincidan con la búsqueda.</p>
          </div>
        )}
      </div>

      {/* Modal Proveedor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-xl rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-8 italic">
              {selectedProveedor ? 'Actualizar Ficha' : 'Nueva Ficha Proveedor'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Razón Social / Empresa</label>
                  <input required value={formData.nombre_empresa || ''} onChange={e => setFormData({ ...formData, nombre_empresa: e.target.value })} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="Nombre de la empresa" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block tracking-widest">RUT / Empresa</label>
                  <input value={formData.rut_empresa || ''} onChange={e => setFormData({ ...formData, rut_empresa: e.target.value })} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="Identificación" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Teléfono Directo</label>
                  <input value={formData.telefono_ || ''} onChange={e => setFormData({ ...formData, telefono_: e.target.value.replace(/\D/g, '').slice(0, 9) })} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="+56 9..." />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Correo de Contacto</label>
                  <input type="email" value={formData.correo_ || ''} onChange={e => setFormData({ ...formData, correo_: e.target.value })} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="empresa@proveedor.com" />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Dirección Comercial</label>
                  <input value={formData.direccion || ''} onChange={e => setFormData({ ...formData, direccion: e.target.value })} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="Calle, Ciudad, Región" />
                </div>
              </div>
              <div className="flex gap-4 pt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold text-gray-400 hover:text-gray-600 transition-colors">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all active:scale-95">
                  {loading ? 'GUARDANDO...' : 'GUARDAR PROVEEDOR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial Compras */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-[2.5rem] p-10 shadow-2xl max-h-[80vh] overflow-auto animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic">Historial de Abastecimiento</h2>
                <p className="text-emerald-600 font-bold uppercase text-[10px] tracking-[0.3em] mt-1">{selectedProveedor?.nombre_empresa}</p>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="w-12 h-12 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-2xl hover:rotate-90 transition-transform shadow-sm">✕</button>
            </div>

            <div className="space-y-4">
              {compras.map(c => (
                <div key={c.id_compra} className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-700 flex justify-between items-center group hover:border-emerald-200 transition-all">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">FECHA: {c.fecha_compra ? new Date(c.fecha_compra).toLocaleDateString() : '---'}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">TRANSACCIÓN: #{c.id_compra.slice(0, 8)}</p>
                  </div>
                  <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter group-hover:text-emerald-600 transition-colors">
                    ${(c.total_compra || 0).toLocaleString()}
                  </p>
                </div>
              ))}
              {compras.length === 0 && (
                <div className="text-center p-20 text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800 font-bold italic uppercase tracking-widest text-xs">
                  Sin registros de compras pasadas
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
