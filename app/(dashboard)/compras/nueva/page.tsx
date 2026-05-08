"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { normalizeText, cleanRUT, logAction, formatCurrency } from '@/lib/utils';

interface Product {
  id: string;
  nombre: string;
  codigo_barra: string;
  precio_compra: number;
}

interface Provider {
  id_proveedor: string;
  nombre_empresa: string;
}

interface CompraItem extends Product {
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
}

export default function NuevaCompraPage() {
  const { role, user, isMounted } = useAuth();
  const router = useRouter();
  
  const [productos, setProductos] = useState<Product[]>([]);
  const [proveedores, setProveedores] = useState<Provider[]>([]);
  const [cart, setCart] = useState<CompraItem[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  
  const [categorias, setCategorias] = useState<{id: string, nombre: string}[]>([]);
  
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
        (supabase as any).from('Producto').select('id, nombre, codigo_barra, precio_compra'),
        (supabase as any).from('Proveedor').select('id_proveedor, nombre_empresa'),
        (supabase as any).from('Categoria').select('id, nombre')
      ]);
      setProductos(pRes.data || []);
      setProveedores(provRes.data || []);
      setCategorias(catRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (role !== 'admin') { router.push('/login'); return; }
    fetchData();
  }, [role, router, isMounted, fetchData]);

  const handleCreateProvider = async () => {
    const nombreNorm = normalizeText(newProvData.nombre);
    if (!nombreNorm) return;

    try {
      const { data: exist } = await (supabase as any)
        .from('Proveedor')
        .select('id_proveedor')
        .eq('nombre_empresa', nombreNorm)
        .maybeSingle();
      
      if (exist) {
        alert('Ya existe un proveedor con ese nombre.');
        return;
      }

      const { data, error } = await (supabase as any)
        .from('Proveedor')
        .insert([{ 
          nombre_empresa: nombreNorm,
          rut_empresa: cleanRUT(newProvData.rut),
          telefono_: newProvData.telefono,
          correo_: newProvData.correo.toLowerCase().trim(),
          direccion: newProvData.direccion.toLowerCase().trim()
        }])
        .select().single();
      
      if (error) throw error;

      if (data) {
        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'creacion',
          modulo: 'compras',
          detalle: `creó proveedor rápido: ${nombreNorm}`
        });
        setProveedores([...proveedores, data]);
        setSelectedProviderId(data.id_proveedor);
        setIsNewProvOpen(false);
        setNewProvData({ nombre: '', rut: '', telefono: '', correo: '', direccion: '' });
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleCreateProduct = async () => {
    const nombreNorm = normalizeText(newProdData.nombre);
    if (!nombreNorm) return;

    try {
      const { data: exist } = await (supabase as any)
        .from('Producto')
        .select('id')
        .eq('nombre', nombreNorm)
        .maybeSingle();
      
      if (exist) {
        alert('Ya existe un producto con ese nombre.');
        return;
      }

      const { data, error } = await (supabase as any)
        .from('Producto')
        .insert([{ 
          nombre: nombreNorm, 
          codigo_barra: cleanRUT(newProdData.codigo) || null,
          precio_compra: newProdData.costo,
          precio_venta_publico: newProdData.venta,
          categoria: normalizeText(newProdData.categoria),
          stock_minimo: newProdData.stockMin,
          stock_actual: 0 
        }])
        .select().single();

      if (error) throw error;

      if (data) {
        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'creacion',
          modulo: 'compras',
          detalle: `creó producto rápido: ${nombreNorm}`
        });
        setProductos([...productos, data]);
        addToCart(data);
        setIsNewProdOpen(false);
        setNewProdData({ nombre: '', codigo: '', costo: 0, venta: 0, categoria: '', stockMin: 5 });
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      updateItem(product.id, existing.cantidad + 1, existing.costo_unitario);
    } else {
      setCart([...cart, { 
        ...product, 
        cantidad: 1, 
        costo_unitario: product.precio_compra || 0, 
        subtotal: product.precio_compra || 0 
      }]);
    }
    setSearch('');
    setShowSearch(false);
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

  const total = cart.reduce((acc, curr) => acc + curr.subtotal, 0);

  const handleGuardarCompra = async () => {
    if (!selectedProviderId || cart.length === 0) {
      alert('Seleccione un proveedor y añada productos.');
      return;
    }

    try {
      setLoading(true);
      const { data: compra, error: cError } = await (supabase as any)
        .from('Compra')
        .insert([{ 
          id_proveedor: selectedProviderId, 
          total_compra: total,
          fecha_compra: new Date().toISOString(),
          forma_pago_compra: 'efectivo'
        }])
        .select().single();

      if (cError || !compra) throw cError;

      for (const item of cart) {
        const { error: dError } = await (supabase as any).from('DetalleCompra').insert([{
          id_compra: compra.id_compra,
          id_producto: item.id,
          cantidad: item.cantidad,
          precio_unitario_compra: item.costo_unitario,
          subtotal: item.subtotal
        }]);

        if (dError) throw dError;

        const { data: currentProd } = await (supabase as any).from('Producto').select('stock_actual').eq('id', item.id).single();
        await (supabase as any).from('Producto').update({
          stock_actual: (currentProd?.stock_actual || 0) + item.cantidad,
          precio_compra: item.costo_unitario 
        }).eq('id', item.id);
      }

      await logAction(supabase, {
        usuario_id: user?.id || '',
        email_usuario: user?.email || '',
        accion: 'compra',
        modulo: 'compras',
        detalle: `registró compra total de $${formatCurrency(total)} para proveedor ID: ${selectedProviderId}`
      });

      alert('Compra registrada exitosamente.');
      router.push('/compras');
    } catch (err: any) {
      alert('Error en registro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500 pb-20">
      
      <div className="flex-1 space-y-6">
        {/* Header Superior */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-700 flex justify-between items-center shadow-sm">
            <div>
                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic uppercase">Ingreso de Mercancía</h1>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Gestión de Abastecimiento e Inventario</p>
            </div>
            <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-2xl shadow-xl shadow-emerald-100 dark:shadow-none">📦</div>
        </div>

        {/* Selector de Proveedor */}
        <div className="bg-white dark:bg-gray-800 p-10 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block italic">Proveedor Seleccionado</label>
            <button onClick={() => setIsNewProvOpen(true)} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline">+ Alta Proveedor</button>
          </div>
          <select 
            value={selectedProviderId} 
            onChange={e => setSelectedProviderId(e.target.value)}
            className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-sm text-emerald-600 appearance-none focus:ring-4 focus:ring-emerald-600/10 transition-all uppercase italic"
          >
            <option value="">-- Buscar Proveedor en Sistema --</option>
            {proveedores.map(p => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre_empresa.toUpperCase()}</option>)}
          </select>
        </div>

        {/* Buscador de Productos */}
        <div className="bg-white dark:bg-gray-800 p-10 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 relative">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block italic">Añadir Productos a la Factura</label>
            <button onClick={() => setIsNewProdOpen(true)} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">+ Nuevo Item</button>
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Escribe nombre o escanea código..." 
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSearch(e.target.value.length > 0); }}
              className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-sm italic placeholder:opacity-30 focus:ring-4 focus:ring-blue-600/10 transition-all"
            />
            {showSearch && (
              <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2rem] shadow-2xl z-50 max-h-80 overflow-auto animate-in fade-in slide-in-from-top-2 duration-300">
                {(() => {
                  const term = normalizeText(search);
                  const termClean = cleanRUT(search);
                  const filtered = productos.filter(p => 
                    normalizeText(p.nombre).includes(term) || 
                    cleanRUT(p.codigo_barra || '').includes(termClean)
                  );

                  if (filtered.length === 0) {
                    return (
                        <div className="p-12 text-center">
                            <p className="text-gray-300 font-black uppercase tracking-widest text-[10px]">Sin coincidencias para</p>
                            <p className="text-blue-600 font-black italic mt-1 text-lg">"{search}"</p>
                            <button onClick={() => setIsNewProdOpen(true)} className="mt-4 px-6 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Crear Ahora</button>
                        </div>
                    );
                  }

                  return filtered.map(p => (
                    <button key={p.id} onClick={() => addToCart(p)} className="w-full p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b last:border-0 border-gray-50 dark:border-gray-700 flex justify-between items-center group transition-all">
                      <div>
                        <p className="font-black text-gray-900 dark:text-white uppercase italic text-sm group-hover:text-blue-600 transition-colors">{p.nombre}</p>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{p.codigo_barra || 'SIN CÓDIGO'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-emerald-600 text-lg tracking-tighter">${formatCurrency(p.precio_compra || 0)}</p>
                        <p className="text-[8px] font-black text-gray-400 uppercase">Costo Actual</p>
                      </div>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Lista de Compra */}
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <tr>
                <th className="px-10 py-6">Descripción</th>
                <th className="px-10 py-6 text-center">Cantidad</th>
                <th className="px-10 py-6 text-right">Costo Unitario</th>
                <th className="px-10 py-6 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {cart.map(item => (
                <tr key={item.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all">
                  <td className="px-10 py-8">
                    <p className="font-black text-gray-900 dark:text-white uppercase italic">{item.nombre}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{item.codigo_barra}</p>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex justify-center">
                        <input 
                            type="number" 
                            value={item.cantidad} 
                            onChange={e => updateItem(item.id, Number(e.target.value), item.costo_unitario)} 
                            className="w-24 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none text-center font-black text-lg focus:ring-4 focus:ring-emerald-600/10" 
                        />
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex justify-end">
                        <input 
                            type="number" 
                            value={item.costo_unitario} 
                            onChange={e => updateItem(item.id, item.cantidad, Number(e.target.value))} 
                            className="w-32 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none text-right font-black text-lg text-emerald-600 focus:ring-4 focus:ring-emerald-600/10" 
                        />
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right font-black text-2xl text-emerald-600 tracking-tighter italic">
                    ${formatCurrency(item.subtotal)}
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                    <td colSpan={4} className="py-40 text-center">
                        <div className="opacity-20 grayscale grayscale-100 flex flex-col items-center">
                            <span className="text-6xl mb-4">🛒</span>
                            <p className="font-black text-gray-400 uppercase tracking-[0.4em] text-[10px]">Lista de carga vacía</p>
                        </div>
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="w-full lg:w-[400px] space-y-6 h-fit sticky top-24">
        <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-900/10 rounded-full -mr-16 -mt-16"></div>
          
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-10 relative">Liquidación de Compra</h2>
          
          <div className="space-y-8 relative">
            <div className="flex justify-between items-center text-gray-400 font-black uppercase text-[10px] tracking-widest px-2">
              <span>Posiciones</span>
              <span className="text-emerald-600">{cart.length} SKUs</span>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900/80 p-10 rounded-[2.5rem] text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
              <p className="text-gray-400 font-black uppercase text-[9px] tracking-[0.4em] mb-3 italic">Total Facturado</p>
              <p className="font-black text-5xl text-gray-900 dark:text-white tracking-tighter italic">${formatCurrency(total)}</p>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center px-4">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Método</span>
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest border border-emerald-100 px-3 py-1 rounded-full bg-emerald-50">Efectivo Caja</span>
                </div>
                <button 
                disabled={loading || cart.length === 0 || !selectedProviderId}
                onClick={handleGuardarCompra}
                className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95 ${loading || cart.length === 0 || !selectedProviderId ? 'bg-gray-100 text-gray-300 shadow-none cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-200 dark:shadow-none'}`}
                >
                {loading ? 'Sincronizando...' : 'FINALIZAR CARGA'}
                </button>
            </div>
          </div>
        </div>
        
        <button onClick={() => router.push('/compras')} className="w-full py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-all text-center">🔙 Volver al Listado</button>
      </div>

      {/* MODAL: Nuevo Proveedor Rápido */}
      {isNewProvOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 relative overflow-y-auto max-h-[90vh]">
            <button onClick={() => setIsNewProvOpen(false)} className="absolute top-10 right-10 text-2xl opacity-20 hover:opacity-100 transition-all">✕</button>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter uppercase">Nuevo Proveedor</h2>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-10">Alta Directa en Base de Datos</p>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre / Empresa</label>
                <input required value={newProvData.nombre} onChange={e => setNewProvData({...newProvData, nombre: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold italic" placeholder="Ej: Distribuidora Central" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">RUT</label>
                    <input value={newProvData.rut} onChange={e => setNewProvData({...newProvData, rut: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="77.123..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Teléfono</label>
                    <input value={newProvData.telefono} onChange={e => setNewProvData({...newProvData, telefono: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="+56 9..." />
                  </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Correo Oficial</label>
                <input value={newProvData.correo} onChange={e => setNewProvData({...newProvData, correo: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="ventas@proveedor.cl" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Ubicación</label>
                <input value={newProvData.direccion} onChange={e => setNewProvData({...newProvData, direccion: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="Santiago, Chile" />
              </div>
              
              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsNewProvOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px]">Cancelar</button>
                <button onClick={handleCreateProvider} className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-emerald-100 dark:shadow-none hover:bg-emerald-500 transition-all">Registrar Proveedor</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo Producto Rápido */}
      {isNewProdOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 relative overflow-y-auto max-h-[95vh]">
             <button onClick={() => setIsNewProdOpen(false)} className="absolute top-10 right-10 text-2xl opacity-20 hover:opacity-100 transition-all">✕</button>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter uppercase">Crear Item Nuevo</h2>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-10">Alta Express para Compra</p>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Descripción del Producto</label>
                <input required value={newProdData.nombre} onChange={e => setNewProdData({...newProdData, nombre: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold italic" placeholder="Ej: Bebida 3L Zero" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Código Barras / SKU</label>
                  <input value={newProdData.codigo} onChange={e => setNewProdData({...newProdData, codigo: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="780123..." />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Rubro / Categoría</label>
                  <select value={newProdData.categoria} onChange={e => setNewProdData({...newProdData, categoria: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-[10px] uppercase tracking-widest">
                    <option value="">Seleccionar...</option>
                    {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Costo Neto ($)</label>
                  <input type="number" value={newProdData.costo} onChange={e => setNewProdData({...newProdData, costo: Number(e.target.value)})} className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-2xl border-none font-black text-lg" placeholder="0" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Precio Venta ($)</label>
                  <input type="number" value={newProdData.venta} onChange={e => setNewProdData({...newProdData, venta: Number(e.target.value)})} className="w-full p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-2xl border-none font-black text-lg" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Alerta Stock Mínimo</label>
                <input type="number" value={newProdData.stockMin} onChange={e => setNewProdData({...newProdData, stockMin: Number(e.target.value)})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsNewProdOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px]">Cerrar</button>
                <button onClick={handleCreateProduct} className="flex-[2] py-5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-100 dark:shadow-none hover:bg-blue-500 transition-all">Crear e Incorporar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
