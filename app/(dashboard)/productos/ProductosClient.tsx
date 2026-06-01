"use client";

export const maxDuration = 60;

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, formatCurrency, normalizeAmount, getProductSearchScore } from '@/lib/utils';
import { Database } from '@/types/database.types';

type ProductoRow = Database['public']['Tables']['Producto']['Row'];
type CategoriaRow = Database['public']['Tables']['Categoria']['Row'];
type OrderType = 'stock_asc' | 'stock_desc' | 'price_asc' | 'price_desc' | 'name_asc';

export default function ProductosClient({ 
  initialProductos, 
  initialCategorias 
}: { 
  initialProductos: ProductoRow[], 
  initialCategorias: CategoriaRow[] 
}) {
  const { role, user } = useAuth();

  // Instrumentación de Hidratación
  const mountTime = useRef(performance.now());

  // Estados de datos inicializados con SSR
  const [productos, setProductos] = useState<ProductoRow[]>(initialProductos);
  const [filtrados, setFiltrados] = useState<ProductoRow[]>(initialProductos);
  const [categorias, setCategorias] = useState<CategoriaRow[]>(initialCategorias);

  // Estados de UI (falso por defecto porque ya tenemos los datos)
  const [loading, setLoading] = useState(false);
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

  // Estado para ajuste de stock (modo edición)
  const [ajusteStock, setAjusteStock] = useState<string>('');
  const [isSolicitudAjusteOpen, setIsSolicitudAjusteOpen] = useState(false);
  const [motivoSolicitud, setMotivoSolicitud] = useState('');
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);

  // 1. Cargar datos desde Supabase (Solo usado post-mutaciones)
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // [PERF] Refactor: Agregamos .limit() y columnas estrictamente necesarias
      const [prodResult, catResult] = await Promise.all([
        (supabase.from('Producto') as any)
          .select('id, nombre, categoria, codigo_barra, precio_compra, precio_venta_publico, stock_actual, stock_minimo, fuente_datos, imagen_url')
          .limit(1000),
        (supabase.from('Categoria') as any)
          .select('id, nombre, activo')
          .order('nombre', { ascending: true })
      ]);

      if (prodResult.error) throw prodResult.error;
      if (catResult.error) throw catResult.error;

      setProductos(prodResult.data || []);
      setCategorias(catResult.data || []);
    } catch (err: unknown) {
      console.error('Error cargando datos en re-fetch:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Se ELIMINA el useEffect vacío inicial. ¡Ya tenemos datos SSR!
  useEffect(() => {
    const hydrationTime = performance.now() - mountTime.current;
    console.log(`[PERF_CACHE] [CLIENT] Hidratación completada en: ${hydrationTime.toFixed(2)}ms`);
    console.log(`[PERF_CACHE] [CLIENT] Productos recibidos del SSR: ${initialProductos.length}`);
  }, [initialProductos]);

  // Lógica combinada de Búsqueda, Filtrado y Ordenamiento
  useEffect(() => {
    let result = [...productos];

    // 1. Filtro por Categoría
    if (categoryFilter !== 'todas') {
      result = result.filter(p => p.categoria === categoryFilter);
    }

    // 2. Búsqueda por relevancia
    const term = searchTerm.trim();
    if (term) {
      const scored = result.map(p => ({
        product: p,
        score: getProductSearchScore(p, term)
      }));

      // Mantener solo los que coinciden en algo
      const matched = scored.filter(item => item.score > 0);

      // Ordenar por relevancia, y en caso de empate por el sortBy seleccionado
      matched.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        switch (sortBy) {
          case 'stock_asc': return (a.product.stock_actual || 0) - (b.product.stock_actual || 0);
          case 'stock_desc': return (b.product.stock_actual || 0) - (a.product.stock_actual || 0);
          case 'price_asc': return (a.product.precio_venta_publico || 0) - (b.product.precio_venta_publico || 0);
          case 'price_desc': return (b.product.precio_venta_publico || 0) - (a.product.precio_venta_publico || 0);
          case 'name_asc': return (a.product.nombre || '').localeCompare(b.product.nombre || '');
          default: return 0;
        }
      });

      result = matched.map(item => item.product);
    } else {
      // 3. Ordenamiento normal si no hay término de búsqueda
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
    }

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
        `\n\nTodos los productos de esta categoría se eliminarán junto con la categoría.`;
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsSaving(true); // Reutilizamos el estado de carga para feedback visual

      if (prodsAsociados.length > 0) {
        const { error: pErr } = await (supabase.from('Producto') as any)
          .delete()
          .eq('categoria', cat.nombre);
        if (pErr) throw pErr;
      }

      const { error: cErr } = await (supabase.from('Categoria') as any).delete().eq('id', id);
      if (cErr) throw cErr;

      await fetchData();
      alert('Categoría y todos sus productos eliminados correctamente.');
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
    setAjusteStock('');
    setMotivoSolicitud('');
    setSolicitudEnviada(false);
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

        // Variables de ajuste (compartidas en el scope del processPromise)
        let ajuste = 0;
        let stockAntes = 0;
        let stockDespues = 0;
        let ajusteAplicado = false;

        if (editingId) {
          const original = productos.find(p => p.id === editingId);
          if (original) {
            if (nombreNorm !== original.nombre) finalData.nombre = nombreNorm;
            if (role === 'admin') {
              if (categoriaNorm !== original.categoria) finalData.categoria = categoriaNorm;
              if (codigoStr !== (original.codigo_barra || '')) finalData.codigo_barra = codigoStr || null;
            }
            const normPrecioCompra = normalizeAmount(formData.precio_compra);
            const normPrecioVenta = normalizeAmount(formData.precio_venta_publico);
            const normStockMinimo = normalizeAmount(formData.stock_minimo);
            if (normPrecioCompra !== original.precio_compra) finalData.precio_compra = normPrecioCompra;
            if (normPrecioVenta !== original.precio_venta_publico) finalData.precio_venta_publico = normPrecioVenta;
            if (normStockMinimo !== original.stock_minimo) finalData.stock_minimo = normStockMinimo;
            if (formData.fuente_datos !== original.fuente_datos) finalData.fuente_datos = formData.fuente_datos;
            if (imageFile) {
              finalData.imagen_url = fotoFinal;
            }
          }

          // ── Lógica de Ajuste de Stock (modo edición) ──
          const rawAjuste = ajusteStock.trim();
          if (rawAjuste !== '' && rawAjuste !== '0') {
            const parsed = parseInt(rawAjuste, 10);
            // Acepta: enteros con o sin signo → "30", "+30", "-30", "-10"
            // Rechaza: decimales, texto, solo signo, vacío inválido
            if (isNaN(parsed) || !/^[+-]?\d+$/.test(rawAjuste)) {
              throw new Error('El ajuste de stock debe ser un número entero. Ejemplo: +30, -10, 5');
            }
            ajuste = parsed;

            // Si es negativo y la cajera no tiene permiso temporal, bloquear
            if (ajuste < 0 && role === 'cajera') {
              const { data: permisos } = await (supabase.from('SolicitudAjusteStock') as any)
                .select('id')
                .eq('cajera_id', user?.id)
                .eq('estado', 'aprobada')
                .eq('tipo_aprobacion', 'temporal')
                .gte('expira_en', new Date().toISOString())
                .limit(1);
              if (!permisos || permisos.length === 0) {
                throw new Error('PERMISO_REQUERIDO');
              }
            }

            // Leer stock real desde la BD (datos frescos)
            const { data: freshProd, error: freshErr } = await (supabase.from('Producto') as any)
              .select('stock_actual')
              .eq('id', editingId)
              .single();
            if (freshErr || !freshProd) throw new Error('No se pudo leer el stock actual del producto.');

            stockAntes = freshProd.stock_actual ?? 0;
            stockDespues = stockAntes + ajuste;

            if (stockDespues < 0) {
              throw new Error(`Este ajuste dejaría el stock en ${stockDespues}. El stock no puede quedar negativo.`);
            }

            finalData.stock_actual = stockDespues;
            ajusteAplicado = true;
          }
        } else {
          // Modo creación: Todo el payload completo (sin cambios)
          finalData = {
            nombre: nombreNorm,
            categoria: categoriaNorm,
            codigo_barra: codigoStr || null,
            precio_compra: normalizeAmount(formData.precio_compra),
            precio_venta_publico: normalizeAmount(formData.precio_venta_publico),
            stock_actual: normalizeAmount(formData.stock_actual),
            stock_minimo: normalizeAmount(formData.stock_minimo),
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

        // Registrar auditoría de ajuste si hubo uno
        if (ajusteAplicado && editingId && user?.id) {
          const tipo = role === 'cajera' ? 'autorizado_temporal' : 'directo';
          await (supabase.from('AjusteStock') as any).insert([{
            producto_id: editingId,
            usuario_id: user.id,
            ajuste,
            stock_antes: stockAntes,
            stock_despues: stockDespues,
            tipo,
          }]);
        }

        // Etapa 4: Sincronización (100%)
        setSaveProgress(95);
        await fetchData(); // Esperar actualización real antes de cerrar
        setSaveProgress(100);

        // Solo actualizar UI si este intento sigue siendo el vigente
        if (currentId === lastOpId.current) {
          console.log(`[PERF] Éxito total en ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
          setIsModalOpen(false);
          resetForm();
        }
      })();

      await Promise.race([processPromise, timeoutPromise]);

    } catch (err: any) {
      if (currentId === lastOpId.current) {
        if (err.name === 'TimeoutError') {
          alert(`El proceso tardó demasiado en responder (60s). Inténtalo de nuevo.`);
        } else if (err.message === 'PERMISO_REQUERIDO') {
          // Cajera necesita permiso del admin para descuento de stock
          setIsSolicitudAjusteOpen(true);
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

    if (window.confirm('¿Eliminar este producto permanentemente?')) {
      // Optimistic update para reflejar el borrado instantáneamente
      setProductos(prev => prev.filter(p => p.id !== id));
      
      const { error } = await (supabase.from('Producto') as any).delete().eq('id', id);
      if (error) {
        alert('Error al eliminar (revisa ventas asociadas o relaciones): ' + error.message);
        fetchData(); // Rollback si falla
      }
    }
  };

  const openEdit = (p: ProductoRow) => {
    setEditingId(p.id);
    setImageFile(null);
    setAjusteStock('');
    setMotivoSolicitud('');
    setSolicitudEnviada(false);
    setFormData({
      ...p,
      categoria: normalizeText(p.categoria || ''),
      codigo_barra: (p.codigo_barra || '').trim()
    });
    setIsModalOpen(true);
  };

  // Enviar solicitud de permiso para ajuste negativo
  const handleEnviarSolicitudAjuste = async () => {
    if (!user?.id || !editingId) return;
    try {
      const productoNombre = productos.find(p => p.id === editingId)?.nombre || editingId;
      const { error } = await (supabase.from('SolicitudAjusteStock') as any).insert([{
        cajera_id: user.id,
        producto_id: editingId,
        ajuste: parseInt(ajusteStock, 10) || 0,
        motivo: motivoSolicitud.trim() || null,
        estado: 'pendiente',
      }]);
      if (error) throw error;
      setSolicitudEnviada(true);
      // Intentar notificación del navegador (si el admin está fuera)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⚠️ Solicitud de ajuste de stock', {
          body: `${user.email} solicita ajustar ${productoNombre} en ${ajusteStock}`,
          icon: '/favicon.ico'
        });
      }
    } catch (err: any) {
      alert('Error al enviar solicitud: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Encabezado y Filtros */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6">
          <div className="flex-1 w-full min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-3 sm:mb-4 tracking-tight leading-tight break-words">Inventario de Productos</h1>
            <div className="relative group">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl group-focus-within:scale-110 transition-transform">🔍</span>
              <input
                type="text"
                placeholder="Buscar por nombre o código de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl focus:ring-4 focus:ring-blue-600/20 transition-all font-bold text-base sm:text-lg leading-normal"
              />
            </div>
          </div>

          {(role === 'admin' || role === 'cajera') && (
            <div className="flex w-full flex-wrap gap-2 sm:gap-3 lg:w-auto">
              <button
                onClick={() => setIsCatManagerOpen(true)}
                className="w-full sm:flex-none bg-white text-gray-900 border-2 border-gray-900 px-4 sm:px-8 py-3 sm:py-4 rounded-2xl font-black shadow-sm hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3 uppercase text-[10px] sm:text-xs tracking-widest"
              >
                <span>📁</span> <span className="hidden sm:inline">Editar</span> Categorías
              </button>
              <button
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                className="w-full sm:flex-none bg-gray-900 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3 uppercase text-[10px] sm:text-xs tracking-widest"
              >
                <span>➕</span> <span className="hidden sm:inline">Nuevo</span> Producto
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
          <div className="flex min-w-0 flex-1 items-center gap-2 bg-gray-50 dark:bg-gray-900 p-2 rounded-2xl border border-gray-100 dark:border-gray-800">
            <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 sm:px-2 shrink-0">Categoría:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full min-w-0 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border-none font-bold text-[11px] sm:text-xs focus:ring-0 cursor-pointer"
            >
              <option value="todas" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Todas</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.nombre || ''} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">{(cat.nombre || '').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 bg-gray-50 dark:bg-gray-900 p-2 rounded-2xl border border-gray-100 dark:border-gray-800">
            <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 sm:px-2 shrink-0">Orden:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as OrderType)}
              className="w-full min-w-0 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border-none font-bold text-[11px] sm:text-xs focus:ring-0 cursor-pointer"
            >
              <option value="name_asc" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">A-Z</option>
              <option value="stock_asc" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Stock ↑</option>
              <option value="stock_desc" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Stock ↓</option>
              <option value="price_asc" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Precio ↑</option>
              <option value="price_desc" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Precio ↓</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Productos */}
      {filtrados.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-8 sm:p-20 rounded-[2rem] sm:rounded-[3.5rem] text-center border-4 border-dashed border-gray-100 dark:border-gray-800">
          <div className="text-5xl sm:text-8xl mb-4 sm:mb-6 opacity-20 grayscale">📦</div>
          <h3 className="text-lg sm:text-2xl font-black text-gray-300 uppercase tracking-[0.2em]">Sin resultados</h3>
          <p className="text-gray-400 font-bold mt-2">Prueba ajustando los filtros o el término de búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {filtrados.map(p => (
            <div key={p.id} className="min-w-0 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 relative group transition-all hover:shadow-2xl hover:-translate-y-1 overflow-hidden">
              <div className="flex justify-between items-start gap-3 mb-4 sm:mb-6">
                <div className="aspect-square w-full max-w-[4.5rem] sm:max-w-[5rem] bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-110 transition-transform overflow-hidden shrink-0">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-contain" />
                  ) : (
                    categorias.find(c => c.nombre === p.categoria) ? '📁' : '📦'
                  )}
                </div>
                <div className="text-right min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Precio Venta</p>
                  <p className="text-lg sm:text-2xl font-black text-blue-600 tracking-tighter break-words">{formatCurrency(p.precio_venta_publico || 0)}</p>
                </div>
              </div>

              <div className="mb-4 sm:mb-8 min-w-0">
                <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white uppercase italic break-words leading-tight">{p.nombre}</h3>
                <p className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-widest break-words">{p.categoria || 'Sin Categoría'}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-8">
                <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl min-w-0">
                  <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock</p>
                  <p className={`text-lg sm:text-xl font-black tracking-tighter break-words ${(p.stock_actual || 0) <= (p.stock_minimo || 0) ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {p.stock_actual}
                  </p>
                </div>
                <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl text-right min-w-0">
                  <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Código</p>
                  <p className="text-[9px] sm:text-[10px] font-black text-gray-400 break-words">{p.codigo_barra || 'S/N'}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-auto">
                <button onClick={() => openEdit(p)} className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all min-h-[44px]">
                  Editar
                </button>
                <button 
                  onClick={() => handleEliminar(p.id)} 
                  className="w-[44px] shrink-0 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all text-lg flex items-center justify-center min-h-[44px]"
                  title="Eliminar producto"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-t-[2rem] sm:rounded-[3rem] p-5 sm:p-10 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <h2 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white mb-1 sm:mb-2 italic">
              {editingId ? 'Editar Ítem' : 'Nuevo Ítem'}
            </h2>
            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 sm:mb-10">Completa la ficha del producto</p>

            <form onSubmit={handleSave} className="space-y-6 max-h-[70vh] overflow-y-auto px-1 sm:px-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Código de Barras</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      placeholder="Escanear o digitar..."
                      value={formData.codigo_barra || ''}
                      onChange={e => setFormData({ ...formData, codigo_barra: e.target.value.replace(/\D/g, '').slice(0, 13) })}
                      disabled={!!editingId && role !== 'admin'}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBarcodeSearch(formData.codigo_barra || '');
                        }
                      }}
                      className="min-w-0 flex-1 p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-base"
                    />
                    <button
                      type="button"
                      onClick={() => handleBarcodeSearch(formData.codigo_barra || '')}
                      disabled={!formData.codigo_barra || isSearchingBarcode || (!!editingId && role !== 'admin')}
                      className="px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-2xl font-black text-xs hover:bg-blue-100 disabled:opacity-50 transition-colors min-h-[44px]"
                      title="Buscar en base local y externa"
                    >
                      {isSearchingBarcode ? '...' : '🔍'}
                    </button>
                  </div>
                  {formData.fuente_datos === 'api' && (
                    <p className="text-[9px] text-emerald-500 font-bold mt-1 px-1">✓ Datos obtenidos de Open Food Facts</p>
                  )}
                </div>

                <div className="sm:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Categoría</label>
                  {!showNewCategoryInput ? (
                    <div className="space-y-3">
                      <select
                        required
                        value={formData.categoria || ''}
                        onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                        disabled={!!editingId && role !== 'admin'}
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
                        disabled={!!editingId && role !== 'admin'}
                        className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-2 disabled:opacity-50"
                      >
                        + Crear nueva categoría
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      <input
                        autoFocus
                        placeholder="Nueva categoría..."
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        className="min-w-0 flex-1 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 font-bold text-sm"
                      />
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={handleSaveCategory} className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors min-h-[44px]">✓</button>
                        <button type="button" onClick={() => setShowNewCategoryInput(false)} className="p-4 bg-gray-200 dark:bg-gray-700 rounded-2xl hover:bg-gray-300 transition-colors min-h-[44px]">✕</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre del Producto</label>
                  <input required value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-base" />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Precio Venta ($)</label>
                  <input
                    required
                    type="number"
                    step="1"
                    min="0"
                    value={formData.precio_venta_publico || 0}
                    onChange={e => {
                      e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                      const cleaned = Math.floor(Number(e.target.value) || 0);
                      setFormData({ ...formData, precio_venta_publico: Math.max(0, cleaned) });
                    }}
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xl text-blue-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Costo Compra ($)</label>
                  <input
                    required
                    type="number"
                    step="1"
                    min="0"
                    value={formData.precio_compra || 0}
                    onChange={e => {
                      e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                      const cleaned = Math.floor(Number(e.target.value) || 0);
                      setFormData({ ...formData, precio_compra: Math.max(0, cleaned) });
                    }}
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-xl"
                  />
                </div>
                <div>
                  {editingId ? (
                    // MODO EDICIÓN: Campo de ajuste por signo (+/-)
                    <>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                        Ajuste de Stock
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Ej: +30, -10, 5"
                          value={ajusteStock}
                          onChange={e => {
                            const val = e.target.value;
                            // Solo permitir enteros con signo opcional
                            if (/^[+-]?\d*$/.test(val)) setAjusteStock(val);
                          }}
                          className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xl"
                        />
                        {ajusteStock && (() => {
                          const n = parseInt(ajusteStock, 10);
                          const stockBase = productos.find(p => p.id === editingId)?.stock_actual ?? 0;
                          const resultado = !isNaN(n) ? stockBase + n : null;
                          return resultado !== null ? (
                            <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest ${
                              resultado < 0 ? 'text-red-500' : 'text-emerald-600'
                            }`}>
                              {stockBase} → {resultado}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-[9px] font-bold text-gray-400 mt-1 px-1 italic">
                        Stock actual: <strong>{productos.find(p => p.id === editingId)?.stock_actual ?? 0}</strong>.
                        {role === 'cajera' && ' Ajustes negativos requieren aprobación del administrador.'}
                      </p>
                    </>
                  ) : (
                    // MODO CREACIÓN: Campo de stock absoluto (sin cambios)
                    <>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Stock Inicial (Unidades)</label>
                      <input
                        required
                        type="number"
                        step="1"
                        min="0"
                        value={formData.stock_actual || 0}
                        onChange={e => {
                          e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                          const cleaned = Math.floor(Number(e.target.value) || 0);
                          setFormData({ ...formData, stock_actual: Math.max(0, cleaned) });
                        }}
                        className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xl"
                      />
                    </>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Stock Mínimo (Unidades)</label>
                  <input
                    required
                    type="number"
                    step="1"
                    min="0"
                    value={formData.stock_minimo || 0}
                    onChange={e => {
                      e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                      const cleaned = Math.floor(Number(e.target.value) || 0);
                      setFormData({ ...formData, stock_minimo: Math.max(0, cleaned) });
                    }}
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-xl text-red-500"
                  />
                </div>

                <div className="sm:col-span-2">
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

              <div className="pt-8 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 sm:py-5 font-black text-gray-400 uppercase tracking-widest min-h-[44px]">Cancelar</button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    background: isSaving
                      ? `linear-gradient(to right, #111827 ${saveProgress}%, #374151 ${saveProgress}%)`
                      : undefined
                  }}
                  className={`flex-1 sm:flex-[2] py-4 sm:py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl transition-all uppercase tracking-[0.2em] text-xs relative overflow-hidden min-h-[44px] ${isSaving ? 'cursor-not-allowed' : 'hover:scale-105 active:scale-95 active:bg-blue-600'}`}
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
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-t-[2rem] sm:rounded-[3rem] p-5 sm:p-10 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4 sm:mb-8">
              <div>
                <h2 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white italic">Categorías</h2>
                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest">Gestiona tus familias de productos</p>
              </div>
              <button onClick={() => setIsCatManagerOpen(false)} className="text-2xl">✕</button>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
              {categorias.map((cat: any) => (
                <div key={cat.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 rounded-[2rem] group min-w-0">
                  {editingCatId === cat.id ? (
                    <div className="flex-1 flex flex-wrap gap-2 w-full">
                      <input
                        autoFocus
                        value={catFormName}
                        onChange={e => setCatFormName(e.target.value)}
                        className="min-w-0 flex-1 p-3 bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-500 font-bold"
                      />
                      <button onClick={() => handleUpdateCategory(cat.id)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold min-h-[44px]">✓</button>
                      <button onClick={() => setEditingCatId(null)} className="px-4 py-2 bg-gray-400 text-white rounded-xl font-bold min-h-[44px]">✕</button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-lg sm:text-xl font-black italic uppercase break-words ${cat.activo === false ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {cat.nombre}
                      </h3>
                      {cat.activo === false && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Suspendida</span>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => { setEditingCatId(cat.id); setCatFormName(cat.nombre); }}
                      className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:scale-110 transition-transform min-h-[44px] min-w-[44px]"
                      title="Editar nombre"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleToggleCategory(cat.id, cat.activo !== false)}
                      className={`p-3 rounded-xl shadow-sm hover:scale-110 transition-transform min-h-[44px] min-w-[44px] ${cat.activo === false ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}
                      title={cat.activo === false ? "Activar" : "Suspender"}
                    >
                      {cat.activo === false ? '🔓' : '🔒'}
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-3 bg-red-50 text-red-600 rounded-xl shadow-sm hover:scale-110 transition-transform min-h-[44px] min-w-[44px]"
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

      {/* ── Modal: Solicitud de Permiso para Ajuste Negativo (Cajera) ── */}
      {isSolicitudAjusteOpen && editingId && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            {!solicitudEnviada ? (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-2xl shrink-0">🔐</div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tighter">Permiso Requerido</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ajuste negativo de stock</p>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6">
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    Producto: <span className="font-black">{productos.find(p => p.id === editingId)?.nombre}</span>
                  </p>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-1">
                    Ajuste solicitado: <span className="font-black text-red-600">{ajusteStock}</span>
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                    Solo el administrador puede autorizar descuentos de stock. Envía la solicitud y espera la aprobación.
                  </p>
                </div>

                <div className="mb-6">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Motivo (Opcional)</label>
                  <textarea
                    value={motivoSolicitud}
                    onChange={e => setMotivoSolicitud(e.target.value)}
                    placeholder="Explica por qué necesitas descontar este stock..."
                    className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm resize-none h-20"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setIsSolicitudAjusteOpen(false); setMotivoSolicitud(''); }}
                    className="flex-1 py-4 font-black text-gray-400 uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleEnviarSolicitudAjuste}
                    className="flex-[2] py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg active:scale-95"
                  >
                    Enviar Solicitud al Admin
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">Solicitud Enviada</h3>
                <p className="text-sm text-gray-500 font-bold mb-6">
                  El administrador recibirá una notificación. Cuando apruebe, podrás realizar el ajuste.
                </p>
                <button
                  onClick={() => { setIsSolicitudAjusteOpen(false); setMotivoSolicitud(''); setSolicitudEnviada(false); }}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all"
                >
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
