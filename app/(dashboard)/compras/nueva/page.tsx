"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

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
  const { role, isMounted } = useAuth();
  const router = useRouter();
  
  const [productos, setProductos] = useState<Product[]>([]);
  const [proveedores, setProveedores] = useState<Provider[]>([]);
  const [cart, setCart] = useState<CompraItem[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isMounted) return;
    if (role !== 'admin') {
      router.push('/login');
      return;
    }
    const fetchData = async () => {
      const [pRes, provRes] = await Promise.all([
        (supabase as any).from('Producto').select('id, nombre, codigo_barra, precio_compra'),
        (supabase as any).from('Proveedor').select('id_proveedor, nombre_empresa')
      ]);
      setProductos(pRes.data || []);
      setProveedores(provRes.data || []);
    };
    fetchData();
  }, [role, router, isMounted]);

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      updateItem(product.id, existing.cantidad + 1, existing.costo_unitario);
    } else {
      setCart([...cart, { ...product, cantidad: 1, costo_unitario: product.precio_compra || 0, subtotal: product.precio_compra || 0 }]);
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
      // 1. Insertar Compra
      const { data: compra, error: cError } = await (supabase as any)
        .from('Compra')
        .insert([{ 
          id_proveedor: selectedProviderId, 
          total_compra: total,
          fecha_compra: new Date().toISOString(),
          forma_pago_compra: 'efectivo'
        }])
        .select().single();

      if (cError || !compra) throw cError || new Error('Error al crear cabecera de compra');

      // 2. Insertar Detalles y Actualizar Productos
      for (const item of cart) {
        const { error: dError } = await (supabase as any).from('DetalleCompra').insert([{
          id_compra: compra.id_compra,
          id_producto: item.id,
          cantidad: item.cantidad,
          precio_unitario_compra: item.costo_unitario,
          subtotal: item.subtotal
        }]);

        if (dError) throw dError;

        // Actualizar Stock y Precio de Compra en catálogo
        const { data: currentProd } = await (supabase as any).from('Producto').select('stock_actual').eq('id', item.id).single();
        await (supabase as any).from('Producto').update({
          stock_actual: (currentProd?.stock_actual || 0) + item.cantidad,
          precio_compra: item.costo_unitario 
        }).eq('id', item.id);
      }

      alert('Compra registrada y stock actualizado.');
      router.push('/compras');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500">
      
      <div className="flex-1 space-y-6">
        {/* Selector de Proveedor */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Proveedor de Mercancía</label>
          <select 
            value={selectedProviderId} 
            onChange={e => setSelectedProviderId(e.target.value)}
            className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-gray-900 dark:text-white appearance-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">-- Seleccionar Proveedor --</option>
            {proveedores.map(p => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre_empresa}</option>)}
          </select>
        </div>

        {/* Buscador de Productos */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 relative">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Buscar Productos para Añadir</label>
          <input 
            type="text" 
            placeholder="Escribe nombre o código del producto..." 
            value={search}
            onChange={e => { setSearch(e.target.value); setShowSearch(e.target.value.length > 0); }}
            className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold"
          />
          {showSearch && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-2xl z-50 max-h-60 overflow-auto">
              {productos.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo_barra?.includes(search)).map(p => (
                <button key={p.id} onClick={() => addToCart(p)} className="w-full p-4 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border-b last:border-0 border-gray-50 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white">{p.nombre}</p>
                  <p className="text-[10px] font-black text-gray-400">Último Costo: ${p.precio_compra?.toLocaleString()}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de Compra */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">Producto</th>
                <th className="px-8 py-5 text-center">Cantidad</th>
                <th className="px-8 py-5 text-right">Costo Unitario</th>
                <th className="px-8 py-5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700 text-sm">
              {cart.map(item => (
                <tr key={item.id}>
                  <td className="px-8 py-6 font-bold">{item.nombre}</td>
                  <td className="px-8 py-6">
                    <input type="number" value={item.cantidad} onChange={e => updateItem(item.id, Number(e.target.value), item.costo_unitario)} className="w-20 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-center font-bold" />
                  </td>
                  <td className="px-8 py-6">
                    <input type="number" value={item.costo_unitario} onChange={e => updateItem(item.id, item.cantidad, Number(e.target.value))} className="w-24 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-right font-bold" />
                  </td>
                  <td className="px-8 py-6 text-right font-black text-emerald-600">${item.subtotal.toLocaleString()}</td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr><td colSpan={4} className="p-12 text-center text-gray-400 italic">No hay productos en la lista.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="w-full lg:w-96 space-y-6 h-fit sticky top-24">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Resumen de Compra</h2>
          <div className="space-y-6">
            <div className="flex justify-between items-center text-gray-400 font-bold uppercase text-[10px]">
              <span>Ítems</span>
              <span>{cart.length} productos</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-3xl text-center border-2 border-emerald-100 dark:border-emerald-900/30">
              <p className="text-emerald-600 font-black uppercase text-[10px] tracking-widest mb-1">Total a Pagar</p>
              <p className="font-black text-4xl text-gray-900 dark:text-white tracking-tighter">${total.toLocaleString()}</p>
            </div>
            <button 
              disabled={loading || cart.length === 0 || !selectedProviderId}
              onClick={handleGuardarCompra}
              className={`w-full py-5 rounded-3xl font-black text-xl shadow-2xl transition-all active:scale-95 ${loading || cart.length === 0 || !selectedProviderId ? 'bg-gray-100 text-gray-300 shadow-none' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100 dark:shadow-none'}`}
            >
              {loading ? 'Procesando...' : 'FINALIZAR COMPRA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

