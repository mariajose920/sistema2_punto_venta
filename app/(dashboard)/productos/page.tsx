"use client";

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
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
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
    fuente_datos: 'manual',
    imagen_url: ''
  });

  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);

  // 1. Cargar datos desde Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: prodData, error: prodError } = await (supabase.from('Producto') as any)
        .select('*');
      if (prodError) throw prodError;
      
      const { data: catData, error: catError } = await (supabase.from('Categoria') as any)
        .select('*')
        .order('nombre', { ascending: true });
      
      if (catError) throw catError;

      setProductos(prodData || []);
      setCategorias(catData || []);
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
      fuente_datos: 'manual',
      imagen_url: ''
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
          imagen_url: data.product.image_url || data.product.image_front_url || prev.imagen_url,
          fuente_datos: 'api' // Autocompletado desde API externa
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
    console.log('[handleSave] Iniciando proceso de guardado...');

    if (role !== 'admin' && role !== 'cajera') {
      console.warn('[handleSave] Intento de guardado sin permisos suficientes.');
      alert('No tienes permisos para realizar cambios en el catálogo.');
      return;
    }

    try {
      setLoading(true);
      
      const nombreNorm = normalizeText(formData.nombre || '');
      const categoriaNorm = normalizeText(formData.categoria || '');
      const codigoStr = String(formData.codigo_barra || '').trim();

      if (!nombreNorm || !categoriaNorm) {
        throw new Error("El nombre y la categoría son obligatorios.");
      }

      console.log('[handleSave] Validando unicidad de nombre:', nombreNorm);
      const { data: nombreExistente, error: errorNombre } = await (supabase.from('Producto') as any)
        .select('id')
        .eq('nombre', nombreNorm)
        .neq('id', editingId || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (errorNombre) {
        console.error('[handleSave] Error verificando nombre:', errorNombre);
        throw new Error(`Error de base de datos al validar nombre: ${errorNombre.message}`);
      }
      if (nombreExistente) {
        throw new Error(`Ya existe un producto con el nombre: "${nombreNorm}"`);
      }

      if (codigoStr && !editingId) {
        console.log('[handleSave] Validando unicidad de código de barras:', codigoStr);
        const { data: codigoExistente, error: errorCodigo } = await (supabase.from('Producto') as any)
          .select('id')
          .eq('codigo_barra', codigoStr)
          .maybeSingle();

        if (errorCodigo) {
          console.error('[handleSave] Error verificando código:', errorCodigo);
          throw new Error(`Error de base de datos al validar código: ${errorCodigo.message}`);
        }
        if (codigoExistente) {
          throw new Error(`Ya existe un producto con el código de barras: "${codigoStr}"`);
        }
      }
      
      let finalImageUrl = formData.imagen_url || null;

      // Lógica de Imagen: Prioridad Archivo > URL Manual
      if (imageFile) {
        console.log('[handleSave] Subiendo archivo al bucket "productos":', imageFile.name);
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = fileName; 

        const { error: uploadError } = await supabase.storage
          .from('productos')
          .upload(filePath, imageFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('[handleSave] ERROR EN STORAGE (UPLOAD):', uploadError);
          throw new Error(`No se pudo subir la imagen al servidor de archivos: ${uploadError.message}. Verifica que el bucket "productos" exista y tenga permisos.`);
        }
        
        console.log('[handleSave] Archivo subido. Obteniendo URL pública...');
        const { data: publicData } = supabase.storage.from('productos').getPublicUrl(filePath);
        
        if (!publicData?.publicUrl) {
           console.error('[handleSave] Error: No se pudo obtener la URL pública del archivo.');
           throw new Error("El archivo se subió pero no pudimos obtener su dirección pública.");
        }
        
        finalImageUrl = publicData.publicUrl;
        console.log('[handleSave] URL de imagen establecida (Storage):', finalImageUrl);
      } else if (finalImageUrl && finalImageUrl.trim() !== '') {
        console.log('[handleSave] Validando URL de imagen externa:', finalImageUrl);
        try {
          if (!finalImageUrl.startsWith('http')) {
            throw new Error("La URL debe comenzar con http:// o https://");
          }
          new URL(finalImageUrl);
        } catch (e: any) {
          console.warn('[handleSave] URL inválida:', finalImageUrl);
          throw new Error(`La URL de la imagen ingresada no es válida: ${e.message}`);
        }
      } else {
        console.log('[handleSave] Producto sin imagen (null).');
        finalImageUrl = null;
      }

      const finalData = {
        nombre: nombreNorm,
        categoria: categoriaNorm,
        codigo_barra: codigoStr || null,
        precio_compra: Number(formData.precio_compra) || 0,
        precio_venta_publico: Number(formData.precio_venta_publico) || 0,
        stock_actual: Number(formData.stock_actual) || 0,
        stock_minimo: Number(formData.stock_minimo) || 0,
        fuente_datos: formData.fuente_datos || 'manual',
        imagen_url: finalImageUrl
      };

      console.log('[handleSave] Datos finales para persistir:', finalData);

      if (editingId) {
        console.log('[handleSave] Actualizando producto existente ID:', editingId);
        const { error: updateError } = await (supabase.from('Producto') as any)
          .update(finalData)
          .eq('id', editingId);
        
        if (updateError) {
          console.error('[handleSave] ERROR EN UPDATE:', updateError);
          throw new Error(`Error al actualizar el producto en la base de datos: ${updateError.message}`);
        }
      } else {
        console.log('[handleSave] Creando nuevo producto...');
        const { error: insertError } = await (supabase.from('Producto') as any)
          .insert([finalData]);
        
        if (insertError) {
          console.error('[handleSave] ERROR EN INSERT:', insertError);
          throw new Error(`Error al insertar el nuevo producto en la base de datos: ${insertError.message}`);
        }
      }
      
      console.log('[handleSave] ¡Guardado exitoso!');
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[handleSave] FALLO EN EL PROCESO:', err);
      alert('⚠️ No se pudo guardar el producto:\n\n' + message);
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
            <button 
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="w-full lg:w-auto bg-gray-900 text-white px-8 py-4 rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
            >
              <span>➕</span> Nuevo Producto
            </button>
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
                      onChange={e => setFormData({...formData, codigo_barra: e.target.value.replace(/\D/g, '').slice(0, 15)})}
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
                    <div className="flex gap-2">
                      <input 
                        autoFocus
                        placeholder="Nueva categoría..."
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        className="flex-1 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 font-bold"
                      />
                      <button type="button" onClick={handleSaveCategory} className="p-4 bg-blue-600 text-white rounded-2xl">✓</button>
                      <button type="button" onClick={() => setShowNewCategoryInput(false)} className="p-4 bg-gray-200 dark:bg-gray-700 rounded-2xl">✕</button>
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
                      <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Subir archivo (Prioridad)</p>
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

                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">O ingresar URL manual</p>
                      <input 
                        type="url"
                        placeholder="https://ejemplo.com/imagen.jpg"
                        value={formData.imagen_url || ''} 
                        onChange={e => setFormData({...formData, imagen_url: e.target.value})} 
                        className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm" 
                      />
                    </div>

                    {imageFile ? (
                      <div className="mt-2 text-xs text-emerald-500 font-bold">✓ Se usará el archivo seleccionado</div>
                    ) : formData.imagen_url ? (
                      <div className="mt-2 text-xs text-blue-500 font-bold">✓ Se usará la URL ingresada</div>
                    ) : null}
                  </div>
                </div>
              </div>
              
              <div className="pt-8 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 font-black text-gray-400 uppercase tracking-widest">Cancelar</button>
                <button type="submit" className="flex-[2] py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all uppercase tracking-[0.2em] text-xs">
                  {editingId ? 'Actualizar Ficha' : 'Registrar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
