"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, logAction, formatCurrency, formatRawInt } from '@/lib/utils';

interface Producto {
  id: string;
  codigo_barra: string;
  nombre: string;
  categoria: string;
  precio_compra: number;
  precio_venta_publico: number;
  stock_actual: number;
  stock_minimo: number;
}

export default function ProductosPage() {
  const { role, user, isMounted } = useAuth();
  
  // Estados de datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [filtrados, setFiltrados] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<{id: string, nombre: string}[]>([]);
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [sortBy, setSortBy] = useState<string>('nombre-asc');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // Estado para el formulario (Agregar/Editar)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Producto>>({
    codigo_barra: '',
    nombre: '',
    categoria: '',
    precio_compra: 0,
    precio_venta_publico: 0,
    stock_actual: 0,
    stock_minimo: 5
  });

  const parseNumber = (val: string) => {
    const clean = val.replace(/\D/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? 0 : num;
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: prodData, error: prodError } = await (supabase as any)
        .from('Producto')
        .select('*')
        .order('nombre', { ascending: true });
      if (prodError) throw prodError;
      
      const { data: catData, error: catError } = await (supabase as any)
        .from('Categoria')
        .select('*')
        .order('nombre', { ascending: true });
      
      setProductos(prodData || []);
      setCategorias(catData || []);
    } catch (err: any) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isMounted) fetchData();
  }, [fetchData, isMounted]);

  useEffect(() => {
    let result = [...productos];

    const term = normalizeText(searchTerm);
    if (term) {
      result = result.filter(p => 
        normalizeText(p.nombre).includes(term) || 
        (p.codigo_barra || '').includes(term)
      );
    }

    if (selectedCategory !== 'todas') {
      result = result.filter(p => p.categoria === selectedCategory);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'stock-desc': return b.stock_actual - a.stock_actual;
        case 'stock-asc': return a.stock_actual - b.stock_actual;
        case 'precio-desc': return b.precio_venta_publico - a.precio_venta_publico;
        case 'precio-asc': return a.precio_venta_publico - b.precio_venta_publico;
        case 'nombre-desc': return b.nombre.localeCompare(a.nombre);
        default: return a.nombre.localeCompare(b.nombre);
      }
    });

    setFiltrados(result);
  }, [searchTerm, productos, selectedCategory, sortBy]);

  const handleSaveCategory = async () => {
    const nameLower = normalizeText(newCategoryName);
    if (!nameLower) return;
    try {
      const { data, error } = await (supabase as any)
        .from('Categoria')
        .insert([{ nombre: nameLower }])
        .select()
        .single();
      
      if (error) throw error;
      
      if (user) {
        await logAction(supabase, {
          usuario_id: user.id,
          email_usuario: user.email!,
          accion: 'creacion',
          modulo: 'productos',
          detalle: `creó categoría: ${nameLower}`
        });
      }

      setCategorias([...categorias, data]);
      setFormData({ ...formData, categoria: data.nombre });
      setShowNewCategoryInput(false);
      setNewCategoryName('');
    } catch (err: any) {
      alert('Error al crear categoría: ' + err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'admin') return;

    try {
      setLoading(true);
      const nombreNorm = normalizeText(formData.nombre);
      if (!nombreNorm) throw new Error('El nombre es obligatorio.');

      const { data: nombreExistente } = await (supabase as any)
        .from('Producto')
        .select('id')
        .eq('nombre', nombreNorm)
        .neq('id', editingId || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (nombreExistente) throw new Error(`Ya existe un producto con el nombre: "${nombreNorm}"`);
      
      const finalData = {
        nombre: nombreNorm,
        categoria: normalizeText(formData.categoria),
        precio_compra: Math.round(formData.precio_compra || 0),
        precio_venta_publico: Math.round(formData.precio_venta_publico || 0),
        codigo_barra: (formData.codigo_barra || '').trim() || null,
        stock_actual: Math.round(formData.stock_actual || 0),
        stock_minimo: Math.round(formData.stock_minimo || 5)
      };

      if (editingId) {
        const { error } = await (supabase as any).from('Producto').update(finalData).eq('id', editingId);
        if (error) throw error;
        if (user) {
          await logAction(supabase, {
            usuario_id: user.id,
            email_usuario: user.email!,
            accion: 'edicion',
            modulo: 'productos',
            detalle: `editó producto: ${nombreNorm}`
          });
        }
      } else {
        const { error } = await (supabase as any).from('Producto').insert([finalData]);
        if (error) throw error;
        if (user) {
          await logAction(supabase, {
            usuario_id: user.id,
            email_usuario: user.email!,
            accion: 'creacion',
            modulo: 'productos',
            detalle: `creó producto: ${nombreNorm}`
          });
        }
      }
      
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEliminar = async (p: Producto) => {
    if (role !== 'admin') return;
    if (window.confirm(`¿Eliminar "${p.nombre.toUpperCase()}"?`)) {
      try {
        const { error } = await (supabase as any).from('Producto').delete().eq('id', p.id);
        if (error) throw error;
        if (user) {
          await logAction(supabase, {
            usuario_id: user.id,
            email_usuario: user.email!,
            accion: 'eliminacion',
            modulo: 'productos',
            detalle: `eliminó producto: ${p.nombre}`
          });
        }
        fetchData();
      } catch (err: any) {
        alert('Error: ' + err.message);
      }
    }
  };

  const openEdit = (p: Producto) => {
    setEditingId(p.id);
    setFormData(p);
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setShowNewCategoryInput(false);
    setFormData({
      codigo_barra: '',
      nombre: '',
      categoria: '',
      precio_compra: 0,
      precio_venta_publico: 0,
      stock_actual: 0,
      stock_minimo: 5
    });
  };

  if (!isMounted) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      
      {/* Encabezado Premium */}
      <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-xl shadow-blue-100 dark:shadow-none">📦</div>
                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic uppercase">Inventario Maestro</h1>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em] ml-2 italic">Control Centralizado de Mercancías</p>
        </div>
        {role === 'admin' && (
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="px-10 py-5 bg-gray-900 hover:bg-blue-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl transition-all transform hover:scale-105 active:scale-95"
          >
            + Añadir Producto
          </button>
        )}
      </div>

      {/* Buscadores */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-6 relative group">
          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl grayscale opacity-30 group-focus-within:opacity-100 transition-opacity">🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por descripción o SKU..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-6 py-5 bg-gray-50 dark:bg-gray-900 border-none rounded-[1.5rem] focus:ring-4 focus:ring-blue-600/10 transition-all font-black text-sm italic uppercase"
          />
        </div>

        <div className="md:col-span-3">
           <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-6 py-5 bg-gray-50 dark:bg-gray-900 border-none rounded-[1.5rem] focus:ring-4 focus:ring-blue-600/10 transition-all font-black text-[10px] uppercase tracking-widest appearance-none text-blue-600 italic"
           >
             <option value="todas">-- Todas las Familias --</option>
             {categorias.map(cat => <option key={cat.id} value={cat.nombre}>{cat.nombre.toUpperCase()}</option>)}
           </select>
        </div>

        <div className="md:col-span-3">
           <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full px-6 py-5 bg-gray-50 dark:bg-gray-900 border-none rounded-[1.5rem] focus:ring-4 focus:ring-blue-600/10 transition-all font-black text-[10px] uppercase tracking-widest appearance-none text-gray-400 italic"
           >
             <option value="nombre-asc">Nombre (A-Z)</option>
             <option value="nombre-desc">Nombre (Z-A)</option>
             <option value="stock-desc">Stock (Mayor a Menor)</option>
             <option value="stock-asc">Stock (Crítico)</option>
             <option value="precio-desc">Precio (Mayor a Menor)</option>
             <option value="precio-asc">Precio (Menor a Mayor)</option>
           </select>
        </div>
      </div>

      {/* Tabla Premium */}
      <div className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <tr>
                <th className="px-10 py-6">Identificación</th>
                <th className="px-10 py-6">Descripción del Ítem</th>
                <th className="px-10 py-6 text-center">Unidades</th>
                <th className="px-10 py-6 text-right">P. Venta</th>
                {role === 'admin' && <th className="px-10 py-6 text-right">Costo Neto</th>}
                <th className="px-10 py-6 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtrados.map(p => (
                <tr key={p.id} className={`group transition-all hover:bg-gray-50/50 dark:hover:bg-gray-700/20 ${p.stock_actual <= p.stock_minimo ? 'bg-red-50/10' : ''}`}>
                  <td className="px-10 py-8">
                    <span className="font-mono text-[10px] font-black text-gray-400 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-xl border border-gray-100 dark:border-gray-800">{p.codigo_barra || 'SIN SKU'}</span>
                  </td>
                  <td className="px-10 py-8">
                    <p className="font-black text-gray-900 dark:text-white text-lg tracking-tighter uppercase italic group-hover:text-blue-600 transition-colors">{p.nombre}</p>
                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.3em] mt-1">{p.categoria}</p>
                  </td>
                  <td className="px-10 py-8 text-center">
                    <div className={`inline-flex flex-col items-center min-w-[80px] p-4 rounded-3xl border-2 transition-all ${
                      p.stock_actual <= p.stock_minimo 
                        ? 'border-red-200 bg-red-50 text-red-600 shadow-lg shadow-red-100' 
                        : 'border-emerald-100 bg-emerald-50 text-emerald-600'
                    }`}>
                      <span className="text-2xl font-black tracking-tighter italic leading-none">{formatRawInt(p.stock_actual)}</span>
                      <span className="text-[8px] uppercase font-black tracking-widest mt-1 opacity-50">Stock</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <p className="font-black text-gray-900 dark:text-white text-2xl tracking-tighter italic">${formatCurrency(p.precio_venta_publico)}</p>
                  </td>
                  {role === 'admin' && (
                    <td className="px-10 py-8 text-right">
                      <p className="text-gray-400 font-black text-sm tracking-tighter italic">${formatCurrency(p.precio_compra)}</p>
                    </td>
                  )}
                  <td className="px-10 py-8 text-center">
                    <div className="flex justify-center gap-3">
                      <button onClick={() => openEdit(p)} className="w-12 h-12 flex items-center justify-center bg-gray-50 dark:bg-gray-700 text-gray-400 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">✏️</button>
                      {role === 'admin' && (
                        <button onClick={() => handleEliminar(p)} className="w-12 h-12 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>

      {/* Modal Premium */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-12 right-12 w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all text-2xl opacity-20 hover:opacity-100">✕</button>
            
            <div className="p-12 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                <h2 className="text-4xl font-black text-gray-900 dark:text-white italic tracking-tighter uppercase">
                  {editingId ? 'Editar Perfil' : 'Alta de Ítem'}
                </h2>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em] mt-2 italic">Sincronización con Base de Datos Maestro</p>
            </div>
            
            <form onSubmit={handleSave} className="p-12 space-y-8 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Descripción Oficial</label>
                  <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-xl italic focus:ring-4 focus:ring-blue-600/10 transition-all uppercase" placeholder="Ej: Bebida Cola 3L" />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Código / SKU</label>
                  <input placeholder="Escanear..." value={formData.codigo_barra || ''} onChange={e => setFormData({...formData, codigo_barra: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-sm tracking-widest focus:ring-4 focus:ring-blue-600/10 transition-all" />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Familia / Categoría</label>
                  {!showNewCategoryInput ? (
                    <div className="space-y-3">
                      <select required value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-[10px] uppercase tracking-widest appearance-none text-blue-600 italic">
                        <option value="">Seleccionar...</option>
                        {categorias.map(cat => <option key={cat.id} value={cat.nombre}>{cat.nombre.toUpperCase()}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowNewCategoryInput(true)} className="text-[9px] font-black text-blue-500 hover:underline uppercase ml-2 tracking-widest">+ Crear Nueva Familia</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
                      <input autoFocus placeholder="Nombre..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className="flex-1 p-5 bg-blue-50 dark:bg-blue-900/20 rounded-[1.5rem] border-2 border-blue-100 font-black text-[10px] uppercase" />
                      <button type="button" onClick={handleSaveCategory} className="w-14 h-14 bg-blue-600 text-white rounded-2xl">✓</button>
                    </div>
                  )}
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-8 bg-gray-50 dark:bg-gray-900/50 p-8 rounded-[2.5rem] border border-gray-100">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 italic">Precio Venta ($)</label>
                    <input required type="text" value={formatRawInt(formData.precio_venta_publico)} onChange={e => setFormData({...formData, precio_venta_publico: parseNumber(e.target.value)})} className="w-full p-4 bg-white dark:bg-gray-800 rounded-2xl border-none font-black text-3xl text-emerald-600 tracking-tighter italic" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 italic">Costo Neto ($)</label>
                    <input required type="text" value={formatRawInt(formData.precio_compra)} onChange={e => setFormData({...formData, precio_compra: parseNumber(e.target.value)})} className="w-full p-4 bg-white dark:bg-gray-800 rounded-2xl border-none font-black text-3xl text-gray-400 tracking-tighter italic" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Stock Físico</label>
                  <input required type="text" value={formatRawInt(formData.stock_actual)} onChange={e => setFormData({...formData, stock_actual: parseNumber(e.target.value)})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-xl italic" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Umbral Crítico</label>
                  <input required type="text" value={formatRawInt(formData.stock_minimo)} onChange={e => setFormData({...formData, stock_minimo: parseNumber(e.target.value)})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-[1.5rem] border-none font-black text-xl italic" />
                </div>
              </div>
              
              <div className="pt-10 flex gap-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px] tracking-widest">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[3] py-6 bg-gray-900 hover:bg-blue-600 text-white font-black rounded-[2rem] shadow-2xl transition-all uppercase tracking-[0.3em] text-xs">
                  {loading ? 'Sincronizando...' : editingId ? 'Actualizar Ficha' : 'Confirmar Alta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
