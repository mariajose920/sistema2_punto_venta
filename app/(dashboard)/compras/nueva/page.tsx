"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { normalizeText, formatCurrency } from '@/lib/utils';
import { Database } from '@/types/database.types';

type ProductoRow = Database['public']['Tables']['Producto']['Row'];
type ProveedorRow = Database['public']['Tables']['Proveedor']['Row'];
type CategoriaRow = Database['public']['Tables']['Categoria']['Row'];
type CompraInsert = Database['public']['Tables']['Compra']['Insert'];
type DetalleCompraInsert = Database['public']['Tables']['DetalleCompra']['Insert'];

interface CompraItem extends ProductoRow {
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
}

export default function NuevaCompraPage() {
  const { role, isMounted } = useAuth();
  const router = useRouter();
  
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [cart, setCart] = useState<CompraItem[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estados para Creación Rápida
  const [isNewProvOpen, setIsNewProvOpen] = useState(false);
  const [newProvData, setNewProvData] = useState({ 
    nombre: '', rut: '', telefono: '', correo: '', direccion: '' 
  });
  
  const [isNewProdOpen, setIsNewProdOpen] = useState(false);
  const [newProdData, setNewProdData] = useState({ 
    nombre: '', codigo: '', costo: 0, venta: 0, categoria: '', stockMin: 5 
  });

  const fetchData = useCallback(async () => {
    try {
      const [pRes, provRes, catRes] = await Promise.all([
        (supabase.from('Producto') as any).select('*'),
        (supabase.from('Proveedor') as any).select('*'),
        (supabase.from('Categoria') as any).select('*')
      ]);
      setProductos(pRes.data || []);
      setProveedores(provRes.data || []);
      setCategorias(catRes.data || []);
    } catch (err: unknown) {
      console.error('Error fetching data:', err);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (role !== 'admin') { router.push('/login'); return; }
    fetchData();
  }, [role, router, isMounted, fetchData]);

  // Búsqueda Robusta
  const filteredProducts = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return [];
    return productos.filter(p => 
      normalizeText(p.nombre).includes(term) || 
      (p.codigo_barra && p.codigo_barra.includes(term))
    ).slice(0, 8);
  }, [search, productos]);

  const handleCreateProvider = async () => {
    const nombreNorm = normalizeText(newProvData.nombre);
    if (!nombreNorm) return;

    try {
      setLoading(true);
      const { data: exist } = await (supabase.from('Proveedor') as any)
        .select('id_proveedor')
        .eq('nombre_empresa', nombreNorm)
        .maybeSingle();
      
      if (exist) {
        alert('Ya existe un proveedor con ese nombre.');
        return;
      }

      const { data, error } = await (supabase.from('Proveedor') as any)
        .insert([{ 
          id_proveedor: crypto.randomUUID(),
          nombre_empresa: nombreNorm,
          rut_empresa: normalizeText(newProvData.rut),
          telefono_: newProvData.telefono,
          correo_: normalizeText(newProvData.correo),
          direccion: normalizeText(newProvData.direccion)
        }])
        .select().single();
      
      if (error) throw error;
      if (data) {
        setProveedores([...proveedores, data]);
        setSelectedProviderId(data.id_proveedor);
        setIsNewProvOpen(false);
        setNewProvData({ nombre: '', rut: '', telefono: '', correo: '', direccion: '' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear proveedor';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async () => {
    const nombreNorm = normalizeText(newProdData.nombre);
    if (!nombreNorm) return;

    try {
      setLoading(true);
      const { data: exist } = await (supabase.from('Producto') as any)
        .select('id')
        .eq('nombre', nombreNorm)
        .maybeSingle();
      
      if (exist) {
        alert('Ya existe un producto con ese nombre.');
        return;
      }

      const { data, error } = await (supabase.from('Producto') as any)
        .insert([{ 
          nombre: nombreNorm, 
          codigo_barra: String(newProdData.codigo || '').trim() || null,
          precio_compra: newProdData.costo,
          precio_venta_publico: newProdData.venta,
          categoria: normalizeText(newProdData.categoria),
          stock_minimo: newProdData.stockMin,
          stock_actual: 0 
        }])
        .select().single();

      if (error) throw error;
      if (data) {
        setProductos([...productos, data]);
        addToCart(data);
        setIsNewProdOpen(false);
        setNewProdData({ nombre: '', codigo: '', costo: 0, venta: 0, categoria: '', stockMin: 5 });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear producto';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (id: string, qty: number, cost: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, qty);
        const newCost = Math.max(0, cost);
        return { ...item, cantidad: newQty, costo_unitario: newCost, subtotal: newQty * newCost };
      }
      return item;
    }));
  };

  const addToCart = (product: ProductoRow) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      updateItem(product.id, existing.cantidad + 1, existing.costo_unitario);
    } else {
      setCart([...cart, { ...product, cantidad: 1, costo_unitario: product.precio_compra || 0, subtotal: product.precio_compra || 0 }]);
    }
    setSearch('');
    setShowSearch(false);
  };

  const totalCompra = useMemo(() => cart.reduce((acc, curr) => acc + curr.subtotal, 0), [cart]);

  const handleGuardarCompra = async () => {
    if (!selectedProviderId || cart.length === 0) {
      alert('Seleccione un proveedor y añada productos.');
      return;
    }

    try {
      setLoading(true);
      const compraPayload: CompraInsert = { 
        id_proveedor: selectedProviderId, 
        total_compra: totalCompra,
        fecha_compra: new Date().toISOString(),
        forma_pago_compra: 'efectivo'
      };

      const { data: compra, error: cError } = await (supabase.from('Compra') as any)
        .insert([compraPayload])
        .select().single();

      if (cError || !compra) throw cError;

      for (const item of cart) {
        const detallePayload: DetalleCompraInsert = {
          id_compra: compra.id_compra,
          id_producto: item.id,
          cantidad_comprada: item.cantidad,
          precio_compra_unitario: item.costo_unitario
          // subtotal no está en Row de DetalleCompra según schema
        };

        const { error: dError } = await (supabase.from('DetalleCompra') as any).insert([detallePayload]);
        if (dError) throw dError;

        // Actualizar Stock y Precio de Compra
        const { data: currentProd } = await (supabase.from('Producto') as any).select('stock_actual').eq('id', item.id).single();
        await (supabase.from('Producto') as any).update({
          stock_actual: (currentProd?.stock_actual || 0) + item.cantidad,
          precio_compra: item.costo_unitario 
        }).eq('id', item.id);
      }

      alert('Compra registrada exitosamente.');
      router.push('/compras');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error en registro';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500 pb-20">
      
      <div className="flex-1 space-y-6">
        {/* Selector de Proveedor */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Proveedor de Mercancía</label>
            <button onClick={() => setIsNewProvOpen(true)} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Registrar Nuevo</button>
          </div>
          <div className="relative">
            <select 
              value={selectedProviderId} 
              onChange={e => setSelectedProviderId(e.target.value)}
              className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-gray-900 dark:text-white appearance-none focus:ring-4 focus:ring-blue-600/10 transition-all uppercase text-sm"
            >
              <option value="">-- Seleccionar Proveedor --</option>
              {proveedores.map(p => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre_empresa.toUpperCase()}</option>)}
            </select>
            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">▼</div>
          </div>
        </div>

        {/* Buscador de Productos */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 relative">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Buscar Productos</label>
            <button onClick={() => setIsNewProdOpen(true)} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">+ Crear Producto</button>
          </div>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Nombre o escanea código..." 
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSearch(e.target.value.length > 0); }}
              className="w-full pl-14 pr-6 py-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold focus:ring-4 focus:ring-blue-600/10 transition-all"
            />
          </div>

          {showSearch && search && (
            <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2rem] shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-300">
              {filteredProducts.length === 0 ? (
                <div className="p-10 text-center text-gray-400 italic font-bold uppercase text-[10px] tracking-widest">Sin resultados para &quot;{search}&quot;</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {filteredProducts.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => addToCart(p)} 
                      className="w-full p-6 text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors flex justify-between items-center group"
                    >
                      <div>
                        <p className="font-black text-gray-900 dark:text-white uppercase italic">{p.nombre}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{p.codigo_barra || 'SIN CÓDIGO'}</p>
                      </div>
                      <p className="font-black text-blue-600 text-lg group-hover:scale-110 transition-transform">{formatCurrency(p.precio_compra)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de Compra */}
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                <tr>
                  <th className="px-10 py-6">Producto</th>
                  <th className="px-10 py-6 text-center">Cantidad</th>
                  <th className="px-10 py-6 text-right">Costo Unitario</th>
                  <th className="px-10 py-6 text-right">Subtotal</th>
                  <th className="px-10 py-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {cart.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-10 py-6">
                      <p className="font-black text-gray-900 dark:text-white uppercase italic">{item.nombre}</p>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{item.codigo_barra}</p>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex justify-center">
                        <input 
                          type="number" 
                          value={item.cantidad} 
                          onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateItem(item.id, Number(e.target.value), item.costo_unitario) }} 
                          className="w-20 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-center font-black text-blue-600 border-none focus:ring-2 focus:ring-blue-600/20" 
                        />
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex justify-end">
                        <input 
                          type="number" 
                          value={item.costo_unitario} 
                          onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateItem(item.id, item.cantidad, Number(e.target.value)) }} 
                          className="w-32 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-right font-black text-gray-900 dark:text-white border-none focus:ring-2 focus:ring-blue-600/20" 
                        />
                      </div>
                    </td>
                    <td className="px-10 py-6 text-right font-black text-blue-600 text-lg">
                      {formatCurrency(item.subtotal)}
                    </td>
                    <td className="px-10 py-6 text-center">
                      <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600 transition-colors">✕</button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr><td colSpan={5} className="p-20 text-center text-gray-300 font-black uppercase tracking-[0.3em] italic opacity-40">Lista de compra vacía</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden p-4 space-y-4">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-gray-300 font-black uppercase tracking-[0.3em] italic opacity-40">Lista de compra vacía</div>
            ) : cart.map(item => (
              <div key={item.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-900 dark:text-white uppercase italic text-sm truncate">{item.nombre}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">{item.codigo_barra}</p>
                  </div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600 p-2 shrink-0">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Cant.</label>
                    <input 
                      type="number" 
                      value={item.cantidad} 
                      onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateItem(item.id, Number(e.target.value), item.costo_unitario) }} 
                      className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl text-center font-black text-blue-600 border-none text-sm focus:ring-2 focus:ring-blue-600/20" 
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Costo U.</label>
                    <input 
                      type="number" 
                      value={item.costo_unitario} 
                      onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateItem(item.id, item.cantidad, Number(e.target.value)) }} 
                      className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl text-right font-black text-gray-900 dark:text-white border-none text-sm focus:ring-2 focus:ring-blue-600/20" 
                    />
                  </div>
                  <div className="flex flex-col justify-center items-end">
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Subtotal</label>
                    <p className="font-black text-blue-600 text-base">{formatCurrency(item.subtotal)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 space-y-6 h-fit sticky top-24">
        <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-700">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-10 text-center">Resumen de Recepción</h2>
          <div className="space-y-8">
            <div className="flex justify-between items-center text-gray-400 font-black uppercase text-[10px] tracking-widest">
              <span>Ítems totales</span>
              <span className="text-gray-900 dark:text-white text-sm">{cart.length}</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/10 p-8 rounded-[2.5rem] text-center border-2 border-blue-100 dark:border-blue-900/30">
              <p className="text-blue-600 font-black uppercase text-[9px] tracking-[0.3em] mb-2">Total Inversión</p>
              <p className="font-black text-4xl text-gray-900 dark:text-white tracking-tighter">{formatCurrency(totalCompra)}</p>
            </div>
            <button 
              disabled={loading || cart.length === 0 || !selectedProviderId}
              onClick={handleGuardarCompra}
              className={`w-full py-6 rounded-[2rem] font-black text-sm tracking-widest transition-all active:scale-95 shadow-2xl uppercase ${loading || cart.length === 0 || !selectedProviderId ? 'bg-gray-100 text-gray-300' : 'bg-gray-900 text-white hover:bg-black'}`}
            >
              {loading ? 'Sincronizando...' : 'Finalizar Recepción'}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: Nuevo Proveedor Rápido */}
      {isNewProvOpen && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2rem] sm:rounded-[3rem] p-8 sm:p-12 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 overflow-y-auto max-h-[90vh]">
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 italic">Nuevo Proveedor</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10">Registro rápido</p>
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Empresa</label>
                <input value={newProvData.nombre} onChange={e => setNewProvData({...newProvData, nombre: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold uppercase italic" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">RUT</label>
                  <input value={newProvData.rut} onChange={e => setNewProvData({...newProvData, rut: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Teléfono</label>
                  <input value={newProvData.telefono} onChange={e => setNewProvData({...newProvData, telefono: e.target.value.replace(/\D/g, '').slice(0, 9)})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Correo</label>
                <input value={newProvData.correo} onChange={e => setNewProvData({...newProvData, correo: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsNewProvOpen(false)} className="flex-1 py-5 text-gray-400 font-black text-[10px] uppercase tracking-widest">Cerrar</button>
                <button onClick={handleCreateProvider} className="flex-[2] py-5 bg-gray-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-2xl">Guardar Proveedor</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo Producto Rápido */}
      {isNewProdOpen && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2rem] sm:rounded-[3rem] p-8 sm:p-12 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 overflow-y-auto max-h-[90vh]">
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 italic">Crear Producto</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10">Catálogo de Inventario</p>
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Descripción</label>
                <input value={newProdData.nombre} onChange={e => setNewProdData({...newProdData, nombre: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold uppercase italic" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Código</label>
                  <input value={newProdData.codigo} onChange={e => setNewProdData({...newProdData, codigo: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Categoría</label>
                  <select value={newProdData.categoria} onChange={e => setNewProdData({...newProdData, categoria: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold uppercase text-[10px]">
                    <option value="">Seleccionar...</option>
                    {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Costo ($)</label>
                  <input type="number" value={newProdData.costo} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setNewProdData({...newProdData, costo: Number(e.target.value)}) }} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-blue-600" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Venta ($)</label>
                  <input type="number" value={newProdData.venta} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setNewProdData({...newProdData, venta: Number(e.target.value)}) }} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-emerald-600" />
                </div>
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsNewProdOpen(false)} className="flex-1 py-5 text-gray-400 font-black text-[10px] uppercase tracking-widest">Cerrar</button>
                <button onClick={handleCreateProduct} className="flex-[2] py-5 bg-blue-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-2xl">Crear y Añadir</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

