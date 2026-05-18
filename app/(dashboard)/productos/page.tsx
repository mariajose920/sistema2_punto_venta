"use client";

export const maxDuration = 60;

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, formatCurrency } from '@/lib/utils';
import { Database } from '@/types/database.types';

type ProductoRow = Database['public']['Tables']['Producto']['Row'];
type CategoriaRow = Database['public']['Tables']['Categoria']['Row'];
type OrderType = 'stock_asc' | 'stock_desc' | 'price_asc' | 'price_desc' | 'name_asc';

export default function ProductosPage() {
  const { role } = useAuth();
  
  // Estados de datos
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [filtrados, setFiltrados] = useState<ProductoRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [sortBy, setSortBy] = useState<OrderType>('name_asc');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catFormName, setCatFormName] = useState('');
  
  // Estado para el formulario (Agregar/Editar)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<Partial<ProductoRow>>({
    codigo_barra: '',
    nombre: '',
    categoria: '',
    precio_compra: 0,
    precio_venta_publico: 0,
    stock_actual: 0,
    stock_minimo: 5,
    fuente_datos: 'manual'
  });

  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const lastOpId = useRef(0);

  // 1. Cargar datos desde Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Ejecución de consultas en paralelo mediante Promise.all para eliminar la cascada de red
      const [prodResult, catResult] = await Promise.all([
        (supabase.from('Producto') as any).select('*'),
        (supabase.from('Categoria') as any).select('*').order('nombre', { ascending: true })
      ]);
      
      if (prodResult.error) throw prodResult.error;
      if (catResult.error) throw catResult.error;

      setProductos(prodResult.data || []);
      setCategorias(catResult.data || []);
    } catch (err: unknown) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lógica combinada de Búsqueda, Filtrado y Ordenamiento
  useEffect(() => {
    let result = [...productos];

    // 1. Búsqueda parcial
    const term = normalizeText(searchTerm);
    if (term) {
      result = result.filter(p => 
        normalizeText(p.nombre || '').includes(term) || 
        (p.codigo_barra || '').toString().toLowerCase().includes(term)
      );
    }

    // 2. Filtro por Categoría
    if (categoryFilter !== 'todas') {
      result = result.filter(p => p.categoria === categoryFilter);
    }

    // 3. Ordenamiento
    result.sort((a, b) => {
      switch (sortBy) {
        case 'stock_asc': return (a.stock_actual || 0) - (b.stock_actual || 0);
        case 'stock_desc': return (b.stock_actual || 0) - (a.stock_actual || 0);
        case 'price_asc': return (a.precio_venta_publico || 0) - (b.precio_venta_publico || 0);
        case 'price_desc': return (b.precio_venta_publico || 0) - (a.precio_venta_publico || 0);
        case 'name_asc': return (a.nombre || '').localeCompare(b.nombre || '');
        default: return 0;
      }
    });

    setFiltrados(result);
  }, [searchTerm, categoryFilter, sortBy, productos]);

  // Manejo de nueva categoría
  const handleUpdateCategory = async (id: string) => {
    if (!catFormName.trim()) return;
    try {
      const { error } = await (supabase.from('Categoria') as any)
        .update({ nombre: normalizeText(catFormName) })
        .eq('id', id);
      if (error) throw error;
      setEditingCatId(null);
      fetchData();
    } catch (err: any) {
      alert('Error al actualizar: ' + err.message);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const cat = categorias.find(c => c.id === id);
    if (!cat) return;

    // Buscar productos asociados localmente para el mensaje
    const prodsAsociados = productos.filter(p => p.categoria === cat.nombre);
    
    let confirmMsg = `¿Seguro que quieres eliminar la categoría "${cat.nombre.toUpperCase()}"?`;
    
    if (prodsAsociados.length > 0) {
      confirmMsg = `⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n` +
                   `La categoría "${cat.nombre.toUpperCase()}" contiene ${prodsAsociados.length} productos:\n` +
                   prodsAsociados.map(p => `• ${p.nombre.toUpperCase()}`).join('\n') +
                   `\n\n¿DESEAS ELIMINAR LA CATEGORÍA Y TODOS ESTOS PRODUCTOS DE FORMA PERMANENTE?\n\nEsta acción no se puede deshacer.`;
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsSaving(true); // Reutilizamos el estado de carga para feedback visual

      // 1. Eliminar productos primero (para evitar errores de FK si existieran o simplemente limpiar)
      if (prodsAsociados.length > 0) {
        const { error: pErr } = await (supabase.from('Producto') as any)
          .delete()
          .eq('categoria', cat.nombre);
        if (pErr) throw pErr;
      }

      // 2. Eliminar la categoría
      const { error: cErr } = await (supabase.from('Categoria') as any).delete().eq('id', id);
      if (cErr) throw cErr;

      await fetchData();
      alert('Categoría y productos asociados eliminados con éxito.');
    } catch (err: any) {
      alert('Error en el proceso de eliminación: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCategory = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await (supabase.from('Categoria') as any)
        .update({ activo: !currentStatus })
        .eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Error al cambiar estado: ' + err.message);
    }
  };

  const handleSaveCategory = async () => {
    const nameLower = normalizeText(newCategoryName);
    if (!nameLower) return;
    try {
      const { data, error } = await (supabase.from('Categoria') as any)
        .insert([{ nombre: nameLower }])
        .select()
        .single();
      
      if (error) throw error;
      setCategorias([...categorias, data]);
      setFormData(prev => ({ ...prev, categoria: data.nombre }));
      setShowNewCategoryInput(false);
      setNewCategoryName('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear categoría';
      alert('Error: ' + message);
    }
  };

  const resetForm = useCallback(() => {
    setEditingId(null);
    setImageFile(null);
    setShowNewCategoryInput(false);
    setFormData({
      codigo_barra: '',
      nombre: '',
      categoria: '',
      precio_compra: 0,
      precio_venta_publico: 0,
      stock_actual: 0,
      stock_minimo: 5,
      fuente_datos: 'manual'
    });
  }, []);

  // Búsqueda Híbrida de Código de Barras
  const handleBarcodeSearch = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    // 1. Buscar en base interna
    const localMatch = productos.find(p => p.codigo_barra === code);
    if (localMatch) {
      if (window.confirm('Este producto ya está registrado localmente. ¿Deseas editar el producto existente?')) {
        openEdit(localMatch);
      }
      return;
    }

    // 2. Consultar Open Food Facts siempre
    try {
      setIsSearchingBarcode(true);
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await res.json();
      
      if (data.status === 1 && data.product && data.product.product_name) {
        setFormData(prev => ({
          ...prev,
          nombre: data.product.product_name,
          fuente_datos: 'api'
        }));
        return;
      }
    } catch (err) {
      console.error('Error buscando en API externa:', err);
    } finally {
      setIsSearchingBarcode(false);
    }

    // 3. No encontrado en API -> Preparar para ingreso manual
    setFormData(prev => ({
      ...prev,
      fuente_datos: 'manual'
    }));
  };

  // 3. Acciones de CRUD
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentId = ++lastOpId.current;
    const startTime = performance.now();
    const timeoutLimit = 60000; // 60 segundos

    if (role !== 'admin' && role !== 'cajera') {
      alert('No tienes permisos para realizar cambios en el catálogo.');
      return;
    }

    try {
      setIsSaving(true);
      setSaveProgress(10);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error('TIMEOUT');
          err.name = 'TimeoutError';
          reject(err);
        }, timeoutLimit);
      });

      const processPromise = (async () => {
        const rawBarcode = formData.codigo_barra;
        const nombreNorm = normalizeText(formData.nombre || '');
        const categoriaNorm = normalizeText(formData.categoria || '');
        const codigoStr = String(rawBarcode || '').trim();

        if (!nombreNorm || !categoriaNorm) {
          throw new Error("El nombre y la categoría son obligatorios.");
        }

        // Etapa 1: Validaciones de Integridad (20%)
        setSaveProgress(20);
        // Eliminada verificación manual de duplicados para optimizar velocidad.
        // La base de datos se encargará de rechazar duplicados si existen.
        let fotoFinal = null;

        // Etapa 2: Procesamiento de Imagen (50%)
        if (imageFile) {
          setSaveProgress(40);
          if (imageFile.size > 2 * 1024 * 1024) {
            throw new Error("La imagen es demasiado pesada (máximo 2MB).");
          }
          const fileExt = imageFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from('productos')
            .upload(fileName, imageFile);

          if (uploadError) throw new Error(`Error al subir imagen: ${uploadError.message}`);
          
          const { data: publicData } = supabase.storage.from('productos').getPublicUrl(fileName);
          fotoFinal = publicData?.publicUrl || null;
          setSaveProgress(60);
        }

        // Si estamos editando, construimos el payload únicamente con los campos modificados para optimizar velocidad y consistencia
        let finalData: any = {};

        if (editingId) {
          const original = productos.find(p => p.id === editingId);
          if (original) {
            if (nombreNorm !== original.nombre) finalData.nombre = nombreNorm;
            if (categoriaNorm !== original.categoria) finalData.categoria = categoriaNorm;
            if (codigoStr !== (original.codigo_barra || '')) finalData.codigo_barra = codigoStr || null;
            if (Number(formData.precio_compra) !== original.precio_compra) finalData.precio_compra = Number(formData.precio_compra);
            if (Number(formData.precio_venta_publico) !== original.precio_venta_publico) finalData.precio_venta_publico = Number(formData.precio_venta_publico);
            if (Number(formData.stock_actual) !== original.stock_actual) finalData.stock_actual = Number(formData.stock_actual);
            if (Number(formData.stock_minimo) !== original.stock_minimo) finalData.stock_minimo = Number(formData.stock_minimo);
            if (formData.fuente_datos !== original.fuente_datos) finalData.fuente_datos = formData.fuente_datos;
            if (imageFile) {
              finalData.imagen_url = fotoFinal;
            }
          }
        } else {
          // Modo creación: Todo el payload completo
          finalData = {
            nombre: nombreNorm,
            categoria: categoriaNorm,
            codigo_barra: codigoStr || null,
            precio_compra: Number(formData.precio_compra) || 0,
            precio_venta_publico: Number(formData.precio_venta_publico) || 0,
            stock_actual: Number(formData.stock_actual) || 0,
            stock_minimo: Number(formData.stock_minimo) || 0,
            fuente_datos: formData.fuente_datos || 'manual',
            imagen_url: fotoFinal
          };
        }

        // Etapa 3: Base de Datos (80%)
        setSaveProgress(80);
        let error = null;
        if (editingId) {
          // Si no hay campos modificados, saltar consulta a base de datos
          if (Object.keys(finalData).length > 0) {
            const res = await (supabase.from('Producto') as any).update(finalData).eq('id', editingId);
            error = res.error;
          }
        } else {
          const res = await (supabase.from('Producto') as any).insert([finalData]);
          error = res.error;
        }

        if (error) throw error;

        // Etapa 4: Sincronización (100%)
        setSaveProgress(95);
        await fetchData(); // Esperar actualización real antes de cerrar
        setSaveProgress(100);

        // Solo actualizar UI si este intento sigue siendo el vigente
        if (currentId === lastOpId.current) {
          console.log(`[PERF] Éxito total en ${((performance.now() - startTime)/1000).toFixed(2)}s`);
          setIsModalOpen(false);
          resetForm();
        }
      })();

      await Promise.race([processPromise, timeoutPromise]);

    } catch (err: any) {
      if (currentId === lastOpId.current) {
        if (err.name === 'TimeoutError') {
          alert(`El proceso tardó demasiado en responder (60s). Inténtalo de nuevo.`);
        } else {
          alert('⚠️ No se pudo guardar el producto:\n\n' + (err.message || 'Error desconocido'));
        }
      }
    } finally {
      if (currentId === lastOpId.current) {
        setIsSaving(false);
        setSaveProgress(0);
      }
    }
  };

  const handleEliminar = async (id: string) => {
    if (role !== 'admin') {
      alert('Acción restringida.');
      return;
    }

    if (window.confirm('¿Eliminar este producto permanentemente?')) {
      const { error } = await (supabase.from('Producto') as any).delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else fetchData();
    }
  };

  const openEdit = (p: ProductoRow) => {
    setEditingId(p.id);
    setImageFile(null);
    setFormData(p);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Encabezado y Filtros */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex-1 w-full">
            <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-4 tracking-tight">Inventario de Productos</h1>
            <div className="relative group">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl group-focus-within:scale-110 transition-transform">🔍</span>
              <input 
                type="text" 
                placeholder="Buscar por nombre o código de barras..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl focus:ring-4 focus:ring-blue-600/20 transition-all font-bold text-lg"
              />
            </div>
          </div>
          
          {(role === 'admin' || role === 'cajera') && (
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <button 
                onClick={() => setIsCatManagerOpen(true)}
                className="bg-white text-gray-900 border-2 border-gray-900 px-8 py-4 rounded-2xl font-black shadow-sm hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
              >
                <span>📁</span> Editar Categorías
              </button>
              <button 
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
              >
                <span>➕</span> Nuevo Producto
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-2 rounded-2xl border border-gray-100 dark:border-gray-800">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Categoría:</span>
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent border-none font-bold text-xs focus:ring-0 cursor-pointer"
            >
              <option value="todas">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.nombre || ''}>{(cat.nombre || '').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-2 rounded-2xl border border-gray-100 dark:border-gray-800">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Ordenar por:</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as OrderType)}
              className="bg-transparent border-none font-bold text-xs focus:ring-0 cursor-pointer"
            >
              <option value="name_asc">Nombre (A-Z)</option>
              <option value="stock_asc">Menor Stock</option>
              <option value="stock_desc">Mayor Stock</option>
              <option value="price_asc">Menor Precio</option>
              <option value="price_desc">Mayor Precio</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Productos */}
      {filtrados.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-20 rounded-[3.5rem] text-center border-4 border-dashed border-gray-100 dark:border-gray-800">
          <div className="text-8xl mb-6 opacity-20 grayscale">📦</div>
          <h3 className="text-2xl font-black text-gray-300 uppercase tracking-[0.2em]">Sin resultados</h3>
          <p className="text-gray-400 font-bold mt-2">Prueba ajustando los filtros o el término de búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filtrados.map(p => (
            <div key={p.id} className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 relative group transition-all hover:shadow-2xl hover:-translate-y-2 overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform overflow-hidden">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                  ) : (
                    categorias.find(c => c.nombre === p.categoria) ? '📁' : '📦'
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Precio Venta</p>
                  <p className="text-2xl font-black text-blue-600 tracking-tighter">{formatCurrency(p.precio_venta_publico || 0)}</p>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-lg font-black text-gray-900 dark:text-white truncate uppercase italic">{p.nombre}</h3>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{p.categoria || 'Sin Categoría'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock</p>
                  <p className={`text-xl font-black tracking-tighter ${(p.stock_actual || 0) <= (p.stock_minimo || 0) ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {p.stock_actual}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl text-right">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Código</p>
                  <p className="text-[10px] font-black text-gray-400 truncate">{p.codigo_barra || 'S/N'}</p>
                </div>
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => openEdit(p)} className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all">Editar</button>
                {role === 'admin' && (
                  <button onClick={() => handleEliminar(p.id)} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all">🗑️</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-2 italic">
              {editingId ? 'Editar Ítem' : 'Nuevo Ítem'}
            </h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-10">Completa la ficha del producto</p>
            
            <form onSubmit={handleSave} className="space-y-6 max-h-[60vh] overflow-y-auto px-2">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Código de Barras</label>
                  <div className="flex gap-2">
                    <input 
                      placeholder="Escanear o digitar..."
                      value={formData.codigo_barra || ''} 
                      onChange={e => setFormData({...formData, codigo_barra: e.target.value.replace(/\D/g, '').slice(0, 13)})}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBarcodeSearch(formData.codigo_barra || '');
                        }
                      }}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg" 
                    />
                    <button
                      type="button"
                      onClick={() => handleBarcodeSearch(formData.codigo_barra || '')}
                      disabled={!formData.codigo_barra || isSearchingBarcode}
                      className="px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-2xl font-black text-xs hover:bg-blue-100 disabled:opacity-50 transition-colors"
                      title="Buscar en base local y externa"
                    >
                      {isSearchingBarcode ? '...' : '🔍'}
                    </button>
                  </div>
                  {formData.fuente_datos === 'api' && (
                    <p className="text-[9px] text-emerald-500 font-bold mt-1 px-1">✓ Datos obtenidos de Open Food Facts</p>
                  )}
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Categoría</label>
                  {!showNewCategoryInput ? (
                    <div className="space-y-3">
                      <select 
                        required 
                        value={formData.categoria || ''} 
                        onChange={e => setFormData({...formData, categoria: e.target.value})} 
                        className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold appearance-none"
                      >
                        <option value="">Seleccionar...</option>
                        {categorias.map(cat => (
                          <option key={cat.id} value={cat.nombre || ''}>{(cat.nombre || '').toUpperCase()}</option>
                        ))}
                      </select>
                      <button 
                        type="button"
                        onClick={() => setShowNewCategoryInput(true)}
                        className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-2"
                      >
                        + Crear nueva categoría
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      <input 
                        autoFocus
                        placeholder="Nueva categoría..."
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        className="min-w-0 flex-1 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 font-bold text-sm"
                      />
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={handleSaveCategory} className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors">✓</button>
                        <button type="button" onClick={() => setShowNewCategoryInput(false)} className="p-4 bg-gray-200 dark:bg-gray-700 rounded-2xl hover:bg-gray-300 transition-colors">✕</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre del Producto</label>
                  <input required value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg" />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Precio Venta</label>
                  <input 
                    required 
                    type="number" 
                    value={formData.precio_venta_publico || 0} 
                    onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setFormData({...formData, precio_venta_publico: Number(e.target.value)}) }} 
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xl text-blue-600" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Costo Compra</label>
                  <input 
                    required 
                    type="number" 
                    value={formData.precio_compra || 0} 
                    onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setFormData({...formData, precio_compra: Number(e.target.value)}) }} 
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-xl" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Stock Actual</label>
                  <input 
                    required 
                    type="number" 
                    value={formData.stock_actual || 0} 
                    onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setFormData({...formData, stock_actual: Number(e.target.value)}) }} 
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xl" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Stock Mínimo</label>
                  <input 
                    required 
                    type="number" 
                    value={formData.stock_minimo || 0} 
                    onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setFormData({...formData, stock_minimo: Number(e.target.value)}) }} 
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-xl text-red-500" 
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Imagen del Producto (Opcional)</label>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Subir archivo de imagen</p>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            setImageFile(e.target.files[0]);
                          }
                        }}
                        className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-8 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 font-black text-gray-400 uppercase tracking-widest">Cancelar</button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  style={{
                    background: isSaving 
                      ? `linear-gradient(to right, #111827 ${saveProgress}%, #374151 ${saveProgress}%)` 
                      : undefined
                  }}
                  className={`flex-[2] py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl transition-all uppercase tracking-[0.2em] text-xs relative overflow-hidden ${isSaving ? 'cursor-not-allowed' : 'hover:scale-105 active:scale-95 active:bg-blue-600'}`}
                >
                  <span className="relative z-10">
                    {isSaving ? `GUARDANDO (${saveProgress}%)` : (editingId ? 'Actualizar Ficha' : 'Registrar Producto')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Gestión de Categorías */}
      {isCatManagerOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-4xl font-black text-gray-900 dark:text-white italic">Categorías</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gestiona tus familias de productos</p>
              </div>
              <button onClick={() => setIsCatManagerOpen(false)} className="text-2xl">✕</button>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
              {categorias.map((cat: any) => (
                <div key={cat.id} className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-900 rounded-[2rem] group">
                  {editingCatId === cat.id ? (
                    <div className="flex-1 flex gap-2 mr-4">
                      <input 
                        autoFocus
                        value={catFormName}
                        onChange={e => setCatFormName(e.target.value)}
                        className="flex-1 p-3 bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-500 font-bold"
                      />
                      <button onClick={() => handleUpdateCategory(cat.id)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">✓</button>
                      <button onClick={() => setEditingCatId(null)} className="px-4 py-2 bg-gray-400 text-white rounded-xl font-bold">✕</button>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <h3 className={`text-xl font-black italic uppercase ${cat.activo === false ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {cat.nombre}
                      </h3>
                      {cat.activo === false && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Suspendida</span>}
                    </div>
                  )}

                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => { setEditingCatId(cat.id); setCatFormName(cat.nombre); }}
                      className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:scale-110 transition-transform"
                      title="Editar nombre"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => handleToggleCategory(cat.id, cat.activo !== false)}
                      className={`p-3 rounded-xl shadow-sm hover:scale-110 transition-transform ${cat.activo === false ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}
                      title={cat.activo === false ? "Activar" : "Suspender"}
                    >
                      {cat.activo === false ? '🔓' : '🔒'}
                    </button>
                    <button 
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-3 bg-red-50 text-red-600 rounded-xl shadow-sm hover:scale-110 transition-transform"
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 pt-8 border-t border-gray-100 dark:border-gray-700">
              <button 
                onClick={() => setIsCatManagerOpen(false)}
                className="w-full py-5 bg-gray-900 text-white font-black rounded-3xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-[0.2em] text-xs"
              >
                Cerrar Gestor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
