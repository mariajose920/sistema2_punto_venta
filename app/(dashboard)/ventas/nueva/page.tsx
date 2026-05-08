"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

interface Product {
  id: string;
  codigo_barra: string;
  nombre: string;
  precio_venta_publico: number;
  stock_actual: number;
}

interface Client {
  id: string;
  nombre: string;
  saldo_deudado: number;
  saldo_favor: number;
}

interface Promotion {
  id: string;
  nombre: string;
  tipo: 'porcentaje' | 'fijo' | '2x1';
  valor: number;
}

interface CartItem extends Product {
  cantidad: number;
  descuento: number;
  subtotal: number;
  isVariable?: boolean;
}

export default function NuevaVentaPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  
  // Estados de datos
  const [productos, setProductos] = useState<Product[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [promociones, setPromociones] = useState<Promotion[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Estados de búsqueda y UI
  const [search, setSearch] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'>('efectivo');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  // Estado para la Calculadora de Precio Variable
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcData, setCalcData] = useState({
    nombre: 'Producto por Peso/Medida',
    precioUnitario: 0,
    cantidad: 1,
  });

  const searchRef = useRef<HTMLInputElement>(null);

  // Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      const today = new Date().toISOString().split('T')[0];
      const [pRes, cRes, promoRes] = await Promise.all([
        (supabase as any).from('Producto').select('id, codigo_barra, nombre, precio_venta_publico, stock_actual').gt('stock_actual', 0),
        (supabase as any).from('Cliente').select('id, nombre, saldo_deudado, saldo_favor'),
        (supabase as any).from('Promocion')
          .select('id, nombre, tipo, valor')
          .eq('activa', true)
          .lte('fecha_inicio', today)
          .gte('fecha_fin', today)
      ]);
      setProductos(pRes.data || []);
      setClientes(cRes.data || []);
      setPromociones(promoRes.data || []);
    };
    fetchData();
  }, []);

  const applyPromotions = useCallback((items: CartItem[]) => {
    return items.map(item => {
      if (item.isVariable) return item; 
      
      let totalDescuento = 0;
      promociones.forEach(promo => {
        if (promo.tipo === '2x1') {
          const pares = Math.floor(item.cantidad / 2);
          totalDescuento += pares * item.precio_venta_publico;
        } else if (promo.tipo === 'porcentaje') {
          totalDescuento += (item.precio_venta_publico * item.cantidad) * (promo.valor / 100);
        } else if (promo.tipo === 'fijo') {
          totalDescuento += promo.valor;
        }
      });

      const subtotal = (item.precio_venta_publico * item.cantidad) - totalDescuento;
      return { ...item, descuento: totalDescuento, subtotal: Math.max(0, subtotal) };
    });
  }, [promociones]);

  const updateCartWithPromos = useCallback((newCart: CartItem[]) => {
    const updated = applyPromotions(newCart);
    setCart(updated);
  }, [applyPromotions]);

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id && !item.isVariable);
    let newCart: CartItem[];

    if (existing) {
      if (existing.cantidad >= product.stock_actual) {
        alert('Stock insuficiente.');
        return;
      }
      newCart = cart.map(item => 
        item.id === product.id ? { ...item, cantidad: item.cantidad + 1 } : item
      );
    } else {
      newCart = [...cart, { ...product, cantidad: 1, descuento: 0, subtotal: product.precio_venta_publico }];
    }

    updateCartWithPromos(newCart);
    setSearch('');
    setShowProductSearch(false);
  };

  const addVariableItem = () => {
    const totalCalc = calcData.precioUnitario * calcData.cantidad;
    if (totalCalc <= 0) {
      alert('El total debe ser mayor a 0');
      return;
    }

    const newItem: CartItem = {
      id: `VAR_${Date.now()}`,
      codigo_barra: 'VARIABLE',
      nombre: calcData.nombre,
      precio_venta_publico: calcData.precioUnitario,
      stock_actual: 999999, 
      cantidad: calcData.cantidad,
      descuento: 0,
      subtotal: totalCalc,
      isVariable: true
    };

    updateCartWithPromos([...cart, newItem]);
    setIsCalcOpen(false);
    setCalcData({ nombre: 'Producto por Peso/Medida', precioUnitario: 0, cantidad: 1 });
  };

  const updateQuantity = (id: string, qty: number) => {
    const newCart = cart.map(item => 
      item.id === id ? { ...item, cantidad: Math.max(0.01, qty) } : item
    );
    updateCartWithPromos(newCart);
  };

  const removeFromCart = (id: string) => {
    updateCartWithPromos(cart.filter(item => item.id !== id));
  };

  const subtotalVenta = cart.reduce((acc, curr) => acc + curr.subtotal, 0);
  const selectedClient = clientes.find(c => c.id === selectedClientId);
  
  // Cálculo de Wallet / Saldo a Favor
  const saldoFavorAplicado = selectedClient ? Math.min(selectedClient.saldo_favor, subtotalVenta) : 0;
  const totalFinal = subtotalVenta - saldoFavorAplicado;

  const handleFinalizarVenta = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'fiado' && !selectedClientId) {
      alert('Seleccione un cliente para realizar la venta al fiado.');
      return;
    }

    if (!user) {
      alert('Error: Sesión no válida.');
      return;
    }

    try {
      setLoading(true);
      
      // 1. Crear la cabecera de la Venta
      const { data: venta, error: vError } = await (supabase as any)
        .from('Venta')
        .insert([{
          id_usuario_cajera: user.id,
          id_cliente: selectedClientId || null,
          total_venta: subtotalVenta,
          forma_pago: paymentMethod,
          iva: subtotalVenta * 0.19,
          estado: 'cerrada',
          observacion: saldoFavorAplicado > 0 ? `Se aplicó saldo a favor de $${saldoFavorAplicado}` : null
        }])
        .select()
        .single();

      if (vError || !venta) throw vError || new Error('Error al crear la cabecera de venta');

      // 2. Insertar detalles y actualizar stock
      for (const item of cart) {
        const { error: dError } = await (supabase as any).from('DetalleVenta').insert([{
          id_venta: venta.id_venta,
          id_producto: item.isVariable ? null : item.id,
          cantidad: item.cantidad,
          precio_unitario_venta: item.precio_venta_publico,
          descuento_aplicado: item.descuento,
          subtotal: item.subtotal
        }]);

        if (dError) throw dError;

        if (!item.isVariable) {
          const { data: prod } = await (supabase as any).from('Producto').select('stock_actual').eq('id', item.id).single();
          await (supabase as any).from('Producto').update({ stock_actual: (prod?.stock_actual || 0) - item.cantidad }).eq('id', item.id);
        }
      }

      // 3. Lógica de Wallet y Deuda
      if (selectedClient) {
        let nuevoSaldoFavor = selectedClient.saldo_favor - saldoFavorAplicado;
        let nuevaDeuda = selectedClient.saldo_deudado;

        if (paymentMethod === 'fiado') {
          nuevaDeuda += totalFinal;
          if (totalFinal > 0) {
            await (supabase as any).from('Credito').insert([{
              cliente_id: selectedClientId,
              venta_id: venta.id_venta,
              monto_inicial: totalFinal,
              saldo_pendiente: totalFinal,
              estado: 'vigente'
            }]);
          }
        }

        const { error: cliUpdateError } = await (supabase as any)
          .from('Cliente')
          .update({ 
            saldo_favor: nuevoSaldoFavor,
            saldo_deudado: nuevaDeuda
          })
          .eq('id', selectedClientId);
        
        if (cliUpdateError) throw cliUpdateError;
      }

      alert('Venta completada con éxito');
      setCart([]);
      router.push(role === 'admin' ? '/admin' : '/cajera');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-160px)] animate-in fade-in duration-500">
      
      <div className="flex-1 flex flex-col gap-6">
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Añadir Producto</label>
            <button 
              onClick={() => setIsCalcOpen(true)}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full hover:bg-blue-600 hover:text-white transition-all"
            >
              ➕ Precio Variable / Pesaje
            </button>
          </div>
          <div className="relative">
            <input 
              ref={searchRef}
              type="text" 
              placeholder="Escanea o busca..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowProductSearch(e.target.value.length > 0); }}
              className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none focus:ring-4 focus:ring-blue-600/20 font-bold text-lg"
            />
            {showProductSearch && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-2xl z-50 max-h-80 overflow-auto">
                {productos.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo_barra?.includes(search)).map(p => (
                  <button key={p.id} onClick={() => addToCart(p)} className="w-full p-5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex justify-between items-center border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{p.nombre}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">STOCK: {p.stock_actual}</p>
                    </div>
                    <p className="font-black text-blue-600 text-lg">${p.precio_venta_publico.toLocaleString()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
            <h2 className="font-black text-gray-900 dark:text-white uppercase text-sm tracking-widest">Carrito de Venta</h2>
          </div>
          <div className="flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 opacity-40 italic font-bold">Carrito vacío.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/30 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-8 py-5 text-left">Producto</th>
                    <th className="px-8 py-5 text-center">Cantidad / Peso</th>
                    <th className="px-8 py-5 text-right">Subtotal</th>
                    <th className="px-8 py-5 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {cart.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-8 py-6">
                        <p className="font-bold text-gray-900 dark:text-white">{item.nombre}</p>
                        <p className="text-[11px] text-gray-400 font-bold tracking-tight">${item.precio_venta_publico.toLocaleString()} c/u</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-4">
                          <button onClick={() => updateQuantity(item.id, item.cantidad - 1)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black">-</button>
                          <span className="font-black text-xl min-w-[2ch] text-center">{item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toFixed(3)}</span>
                          <button onClick={() => updateQuantity(item.id, item.cantidad + 1)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black">+</button>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right font-black text-gray-900 dark:text-white text-xl">
                        ${item.subtotal.toLocaleString()}
                      </td>
                      <td className="px-8 py-6 text-center">
                        <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 text-2xl transition-all">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 flex flex-col gap-6 h-fit sticky top-24">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 space-y-8">
          <h2 className="font-black text-gray-900 dark:text-white uppercase tracking-widest text-xs">Finalizar Venta</h2>
          
          <div className="space-y-6">
            {/* Selección de Cliente Universal */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Asignar Cliente (Opcional)</label>
              <select 
                value={selectedClientId} 
                onChange={(e) => setSelectedClientId(e.target.value)} 
                className={`w-full p-4 rounded-2xl font-bold text-sm border-none transition-colors ${
                  selectedClient?.saldo_favor && selectedClient.saldo_favor > 0 
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' 
                    : 'bg-gray-50 dark:bg-gray-900 text-gray-500'
                }`}
              >
                <option value="">-- Venta General (Sin Cliente) --</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.saldo_favor > 0 ? `(Saldo: $${c.saldo_favor.toLocaleString()})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['efectivo', 'transferencia', 'tarjeta', 'fiado'].map(m => (
                <button 
                  key={m} 
                  onClick={() => setPaymentMethod(m as any)} 
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${
                    paymentMethod === m 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xl' 
                      : 'bg-gray-50 dark:bg-gray-900 text-gray-500 border-transparent'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Desglose de Totales */}
            <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-gray-400 uppercase text-[10px]">Subtotal</span>
                <span className="font-black text-gray-900 dark:text-white">${subtotalVenta.toLocaleString()}</span>
              </div>
              
              {saldoFavorAplicado > 0 && (
                <div className="flex justify-between items-center text-sm text-emerald-600">
                  <span className="font-bold uppercase text-[10px]">Saldo a Favor Aplicado</span>
                  <span className="font-black">-${saldoFavorAplicado.toLocaleString()}</span>
                </div>
              )}

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-blue-600 font-black uppercase text-[10px] tracking-widest mb-1 text-center">Total a Cobrar</p>
                <p className="font-black text-5xl text-gray-900 dark:text-white tracking-tighter text-center">
                  ${totalFinal.toLocaleString()}
                </p>
              </div>
            </div>

            <button 
              disabled={loading || cart.length === 0} 
              onClick={handleFinalizarVenta} 
              className={`w-full py-5 rounded-3xl font-black text-xl shadow-2xl transition-all active:scale-95 ${
                loading || cart.length === 0 
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed' 
                  : 'bg-blue-600 text-white shadow-blue-200 dark:shadow-none hover:bg-blue-700'
              }`}
            >
              {loading ? 'PROCESANDO...' : totalFinal === 0 ? 'FINALIZAR (CON SALDO)' : 'COMPLETAR VENTA'}
            </button>
          </div>
        </div>
      </div>

      {isCalcOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-8">🧮 Calculadora de Venta</h2>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre / Concepto</label>
                <input value={calcData.nombre} onChange={e => setCalcData({...calcData, nombre: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Precio Unitario ($)</label>
                  <input type="number" value={calcData.precioUnitario} onChange={e => setCalcData({...calcData, precioUnitario: Number(e.target.value)})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Cantidad / Peso</label>
                  <input type="number" step="0.001" value={calcData.cantidad} onChange={e => setCalcData({...calcData, cantidad: Number(e.target.value)})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
                </div>
              </div>
              <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-3xl text-center">
                <p className="text-blue-600 font-black uppercase text-[10px] tracking-widest mb-1">Cálculo Total</p>
                <p className="font-black text-4xl text-gray-900 dark:text-white">
                  ${(calcData.precioUnitario * calcData.cantidad).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsCalcOpen(false)} className="flex-1 font-bold text-gray-400 py-4">Cancelar</button>
                <button onClick={addVariableItem} className="flex-2 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-200">AÑADIR A VENTA</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
