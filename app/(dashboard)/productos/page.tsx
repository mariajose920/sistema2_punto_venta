"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

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
  const { role } = useAuth();
  
  // Estados de datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [filtrados, setFiltrados] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<{id: string, nombre: string}[]>([]);
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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

  const barcodeRef = useRef<HTMLInputElement>(null);

  // Utilidades de Formateo
  const formatNumber = (val: number | undefined) => {
    if (val === undefined || val === null) return '';
    return val.toLocaleString('es-CL');
  };

  const parseNumber = (val: string) => {
    // Elimina todo lo que no sea número y quita ceros iniciales al convertir
    const clean = val.replace(/\D/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? 0 : num;
  };

  // 1. Cargar datos desde Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Cargar Productos
      const { data: prodData, error: prodError } = await (supabase as any)
        .from('Producto')
        .select('*')
        .order('nombre', { ascending: true });
      if (prodError) throw prodError;
      
      // Cargar Categorías
      const { data: catData, error: catError } = await (supabase as any)
        .from('Categoria')
        .select('*')
        .order('nombre', { ascending: true });
      
      setProductos(prodData || []);
      setFiltrados(prodData || []);
      setCategorias(catData || []);
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError('Error al conectar con Supabase.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Manejo de nueva categoría
  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const { data, error } = await (supabase as any)
        .from('Categoria')
        .insert([{ nombre: newCategoryName.trim() }])
        .select()
        .single();
      
      if (error) throw error;
      setCategorias([...categorias, data]);
      setFormData({ ...formData, categoria: data.nombre });
      setShowNewCategoryInput(false);
      setNewCategoryName('');
    } catch (err: any) {
      alert('Error al crear categoría: ' + err.message);
    }
  };

  // 3. Acciones de CRUD
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'admin') {
      alert('Solo el administrador puede realizar cambios directos en el catálogo.');
      return;
    }

    try {
      setLoading(true);
      
      // Validación de Código de Barras Único (si se ingresó uno)
      if (formData.codigo_barra && formData.codigo_barra.trim() !== '') {
        const { data: existente, error: checkError } = await (supabase as any)
          .from('Producto')
          .select('id, nombre')
          .eq('codigo_barra', formData.codigo_barra.trim())
          .neq('id', editingId || '00000000-0000-0000-0000-000000000000') // Excluir el actual si editamos
          .maybeSingle();

        if (existente) {
          throw new Error(`El código de barras ya pertenece al producto: "${existente.nombre}"`);
        }
      }

      // Limpiar código de barras si está vacío para evitar colisiones de strings vacíos
      const finalData = {
        ...formData,
        codigo_barra: formData.codigo_barra?.trim() || null
      };

      if (editingId) {
        const { error } = await (supabase as any).from('Producto').update(finalData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('Producto').insert([finalData]);
        if (error) throw error;
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

  const handleEliminar = async (id: string) => {
    if (role !== 'admin') {
      alert('Acción restringida.');
      return;
    }

    if (window.confirm('¿Eliminar este producto permanentemente?')) {
      const { error } = await (supabase as any).from('Producto').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else fetchData();
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Encabezado y Búsqueda */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex-1 w-full">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Gestión de Inventario</h1>
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl group-focus-within:scale-110 transition-transform">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar por nombre, categoría o escanea código de barras..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border-none rounded-xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
            />
          </div>
        </div>
        
        {role === 'admin' && (
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none flex items-center justify-center gap-2 transition-all transform active:scale-95"
          >
            <span>➕</span> Nuevo Producto
          </button>
        )}
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Información Producto</th>
                <th className="px-6 py-4 text-center">Stock</th>
                <th className="px-6 py-4 text-right">Precio Venta</th>
                {role === 'admin' && <th className="px-6 py-4 text-right">Costo Compra</th>}
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="p-12 text-center animate-pulse font-bold text-gray-400">Consultando Base de Datos...</td></tr>
              ) : filtrados.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors ${p.stock_actual <= p.stock_minimo ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                  <td className="px-6 py-4 font-mono text-xs text-gray-400">{p.codigo_barra || 'S/N'}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900 dark:text-white">{p.nombre}</p>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{p.categoria}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex flex-col items-center p-2 rounded-xl border ${
                      p.stock_actual <= p.stock_minimo 
                        ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20' 
                        : 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20'
                    }`}>
                      <span className="text-sm font-black">{p.stock_actual}</span>
                      <span className="text-[9px] uppercase font-bold opacity-70">unidades</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="font-black text-gray-900 dark:text-white text-lg">${p.precio_venta_publico.toLocaleString('es-CL')}</p>
                  </td>
                  {role === 'admin' && (
                    <td className="px-6 py-4 text-right">
                      <p className="text-gray-400 font-bold text-sm">${p.precio_compra.toLocaleString('es-CL')}</p>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(p)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors">✏️</button>
                      {role === 'admin' && (
                        <button onClick={() => handleEliminar(p.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 rounded-lg transition-colors">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Producto (Admin) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-black text-gray-900 dark:text-white">
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-2xl hover:rotate-90 transition-transform">✕</button>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Código de Barras (Opcional)</label>
                  <input 
                    placeholder="Escanear o digitar..."
                    value={formData.codigo_barra || ''} 
                    onChange={e => setFormData({...formData, codigo_barra: e.target.value})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold" 
                  />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Categoría</label>
                  {!showNewCategoryInput ? (
                    <div className="space-y-2">
                      <div className="relative group">
                        <select 
                          required 
                          value={formData.categoria} 
                          onChange={e => setFormData({...formData, categoria: e.target.value})} 
                          className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold appearance-none pr-10"
                        >
                          <option value="">Seleccionar...</option>
                          {categorias.map(cat => (
                            <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>
                          ))}
                        </select>
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setShowNewCategoryInput(true)}
                        className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1 transition-colors"
                      >
                        <span>➕</span> Agregar nueva categoría
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full animate-in slide-in-from-top-2 duration-200">
                      <input 
                        autoFocus
                        placeholder="Nueva categoría..."
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        className="flex-1 min-w-0 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button 
                        type="button" 
                        onClick={handleSaveCategory} 
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 dark:shadow-none hover:scale-105 active:scale-95 transition-all"
                      >
                        ✓
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setShowNewCategoryInput(false)} 
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Nombre del Producto</label>
                  <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold" />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Precio Venta</label>
                  <input 
                    required 
                    type="text" 
                    value={formatNumber(formData.precio_venta_publico)} 
                    onChange={e => setFormData({...formData, precio_venta_publico: parseNumber(e.target.value)})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Costo Compra</label>
                  <input 
                    required 
                    type="text" 
                    value={formatNumber(formData.precio_compra)} 
                    onChange={e => setFormData({...formData, precio_compra: parseNumber(e.target.value)})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Stock Actual</label>
                  <input 
                    required 
                    type="text" 
                    value={formatNumber(formData.stock_actual)} 
                    onChange={e => setFormData({...formData, stock_actual: parseNumber(e.target.value)})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Stock Mínimo</label>
                  <input 
                    required 
                    type="text" 
                    value={formatNumber(formData.stock_minimo)} 
                    onChange={e => setFormData({...formData, stock_minimo: parseNumber(e.target.value)})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-blue-600 border-none font-bold" 
                  />
                </div>
              </div>
              
              <div className="pt-6 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none transition-all transform active:scale-95">
                  {editingId ? 'Actualizar' : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
