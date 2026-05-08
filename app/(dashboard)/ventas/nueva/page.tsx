"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { normalizeText, logAction, formatCurrency } from '@/lib/utils';

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
  rut: string;
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
  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [pRes, cRes, promoRes] = await Promise.all([
      (supabase as any).from('Producto').select('id, codigo_barra, nombre, precio_venta_publico, stock_actual').gt('stock_actual', 0),
      (supabase as any).from('Cliente').select('*'),
      (supabase as any).from('Promocion')
        .select('id, nombre, tipo, valor')
        .eq('activa', true)
        .lte('fecha_inicio', today)
        .gte('fecha_fin', today)
    ]);
    setProductos(pRes.data || []);
    setClientes(cRes.data || []);
    setPromociones(promoRes.data || []);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const [calcSearch, setCalcSearch] = useState('');
  const [showCalcSearch, setShowCalcSearch] = useState(false);

  const addVariableItem = () => {
    const totalCalc = calcData.precioUnitario * calcData.cantidad;
    if (totalCalc <= 0) {
      alert('El total debe ser mayor a 0');
      return;
    }

    const newItem: CartItem = {
      id: `VAR_${Date.now()}`,
      codigo_barra: 'VARIABLE',
      nombre: normalizeText(calcData.nombre),
      precio_venta_publico: calcData.precioUnitario,
      stock_actual: 999999, 
      cantidad: calcData.cantidad,
      descuento: 0,
      subtotal: totalCalc,
      isVariable: true
    };

    updateCartWithPromos([...cart, newItem]);
    setIsCalcOpen(false);
    setCalcData({ nombre: 'producto por peso/medida', precioUnitario: 0, cantidad: 1 });
    setCalcSearch('');
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
  
  // Cálculo de Wallet / Saldo a Favor según REGLA:
  // 1. Si el cliente tiene saldo a favor, primero se descuenta de ahí.
  const saldoFavorAplicado = selectedClient ? Math.min(selectedClient.saldo_favor, subtotalVenta) : 0;
  const remanenteVenta = subtotalVenta - saldoFavorAplicado;

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
          observacion: saldoFavorAplicado > 0 ? `Se aplicó saldo a favor de $${formatCurrency(saldoFavorAplicado)}` : null
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

      // 3. Lógica de Wallet y Deuda (REGLA ACTUALIZADA)
      if (selectedClient) {
        let nuevoSaldoFavor = selectedClient.saldo_favor - saldoFavorAplicado;
        let nuevaDeuda = selectedClient.saldo_deudado;

        if (remanenteVenta > 0) {
          if (paymentMethod === 'fiado') {
            nuevaDeuda += remanenteVenta;
            await (supabase as any).from('Credito').insert([{
              cliente_id: selectedClientId,
              venta_id: venta.id_venta,
              monto_inicial: remanenteVenta,
              saldo_pendiente: remanenteVenta,
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

      // 4. Auditoría
      await logAction(supabase, {
        usuario_id: user.id,
        email_usuario: user.email!,
        accion: 'venta',
        modulo: 'ventas',
        detalle: `generó venta #${venta.id_venta} por $${formatCurrency(subtotalVenta)}`
      });

      alert('Venta completada con éxito');
      setCart([]);
      router.push(role === 'admin' ? '/admin' : '/cajera');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = productos.filter(p => {
    const term = normalizeText(search);
    return normalizeText(p.nombre).includes(term) || (p.codigo_barra || '').includes(term);
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-160px)] animate-in fade-in duration-500 pb-20">
      
      <div className="flex-1 flex flex-col gap-6">
        
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Buscador de Mercadería</h2>
            <button 
              onClick={() => setIsCalcOpen(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-blue-200 dark:shadow-none"
            >
              ➕ Precio Variable / Pesaje
            </button>
          </div>
          <div className="relative">
            <input 
              ref={searchRef}
              type="text" 
              placeholder="Escanea código o escribe nombre del producto..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowProductSearch(e.target.value.length > 0); }}
              className="w-full p-6 bg-gray-50 dark:bg-gray-900 rounded-3xl border-none focus:ring-4 focus:ring-blue-600/10 font-bold text-xl tracking-tight"
            />
            {showProductSearch && (
              <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2rem] shadow-2xl z-50 max-h-[500px] overflow-auto custom-scrollbar">
                {filteredProducts.length === 0 ? (
                  <div className="p-16 text-center text-gray-300 italic font-black uppercase tracking-widest text-sm">
                    Sin resultados para "{search}"
                  </div>
                ) : (
                  filteredProducts.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => addToCart(p)} 
                      className="w-full p-6 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex justify-between items-center border-b border-gray-50 dark:border-gray-700 last:border-0 group transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black text-xs text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          {p.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-gray-900 dark:text-white text-lg tracking-tighter uppercase italic">{p.nombre}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Stock: {p.stock_actual} | {p.codigo_barra || 'S/N'}</p>
                        </div>
                      </div>
                      <p className="font-black text-blue-600 text-2xl tracking-tighter">${formatCurrency(p.precio_venta_publico)}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
            <h2 className="font-black text-gray-900 dark:text-white uppercase text-xs tracking-[0.2em] italic">Detalle del Carrito</h2>
          </div>
          <div className="flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-20 opacity-20 grayscale">
                <div className="text-8xl mb-4">🛒</div>
                <p className="font-black uppercase tracking-widest text-sm">Esperando productos...</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/30 text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-10 py-6 text-left">Ítem</th>
                    <th className="px-10 py-6 text-center">Cantidad</th>
                    <th className="px-10 py-6 text-right">Subtotal</th>
                    <th className="px-10 py-6 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {cart.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50/30 dark:hover:bg-gray-800/40 transition-all">
                      <td className="px-10 py-8">
                        <p className="font-black text-gray-900 dark:text-white text-lg tracking-tighter uppercase italic">{item.nombre}</p>
                        <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">${formatCurrency(item.precio_venta_publico)} unit.</p>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center justify-center gap-6">
                          <button onClick={() => updateQuantity(item.id, item.cantidad - 1)} className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl font-black hover:bg-gray-900 hover:text-white transition-all">-</button>
                          <span className="font-black text-3xl tracking-tighter w-[3ch] text-center">{item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toFixed(3)}</span>
                          <button onClick={() => updateQuantity(item.id, item.cantidad + 1)} className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl font-black hover:bg-gray-900 hover:text-white transition-all">+</button>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right font-black text-gray-900 dark:text-white text-3xl tracking-tighter">
                        ${formatCurrency(item.subtotal)}
                      </td>
                      <td className="px-10 py-8 text-center">
                        <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-50 text-gray-200 hover:text-red-500 transition-all text-xl">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[450px] flex flex-col gap-6 h-fit sticky top-24">
        <div className="bg-gray-900 text-white p-10 rounded-[3rem] shadow-2xl space-y-10 border-4 border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          
          <div>
            <h2 className="font-black text-blue-400 uppercase tracking-[0.4em] text-[10px] mb-8">Liquidación de Venta</h2>
            
            {/* Selección de Cliente */}
            <div className="space-y-4 mb-10">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Asignación de Comprobante</label>
              <select 
                value={selectedClientId} 
                onChange={(e) => setSelectedClientId(e.target.value)} 
                className={`w-full p-5 rounded-2xl font-black text-xs uppercase tracking-widest border-none transition-all appearance-none ${
                  selectedClient?.saldo_favor && selectedClient.saldo_favor > 0 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-white/5 text-gray-400'
                }`}
              >
                <option value="" className="text-black italic">-- Venta al Público General --</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id} className="text-black">
                    {c.nombre.toUpperCase()} {c.saldo_favor > 0 ? `(FAVOR: $${formatCurrency(c.saldo_favor)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Método de Pago */}
            <div className="grid grid-cols-2 gap-3 mb-12">
              {['efectivo', 'transferencia', 'tarjeta', 'fiado'].map(m => (
                <button 
                  key={m} 
                  onClick={() => setPaymentMethod(m as any)} 
                  className={`py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${
                    paymentMethod === m 
                      ? 'bg-white text-gray-900 border-white shadow-xl scale-105' 
                      : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Totales */}
            <div className="space-y-6 pt-10 border-t border-white/10">
              <div className="flex justify-between items-center opacity-60">
                <span className="font-black uppercase text-[10px] tracking-widest">Subtotal Bruto</span>
                <span className="font-black text-xl">${formatCurrency(subtotalVenta)}</span>
              </div>
              
              {saldoFavorAplicado > 0 && (
                <div className="flex justify-between items-center text-emerald-400">
                  <span className="font-black uppercase text-[10px] tracking-widest">Saldo Favor Aplicado</span>
                  <span className="font-black text-xl">-${formatCurrency(saldoFavorAplicado)}</span>
                </div>
              )}

              <div className="pt-8">
                <p className="text-blue-400 font-black uppercase text-[11px] tracking-[0.5em] mb-4 text-center">Neto a Pagar</p>
                <p className="font-black text-7xl text-white tracking-tighter text-center italic drop-shadow-2xl">
                  ${formatCurrency(remanenteVenta)}
                </p>
              </div>
            </div>

            <button 
              disabled={loading || cart.length === 0} 
              onClick={handleFinalizarVenta} 
              className={`w-full py-7 mt-12 rounded-[2rem] font-black text-lg tracking-[0.2em] transition-all active:scale-95 shadow-2xl ${
                loading || cart.length === 0 
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-blue-600/40'
              }`}
            >
              {loading ? 'PROCESANDO...' : 'CONFIRMAR TRANSACCIÓN'}
            </button>
          </div>
        </div>
      </div>

      {/* Calculadora Variable */}
      {isCalcOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh] relative">
             <button onClick={() => setIsCalcOpen(false)} className="absolute top-8 right-8 text-2xl opacity-20 hover:opacity-100 transition-opacity">✕</button>
            
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-10 italic tracking-tighter">Cálculo por Peso</h2>
            
            <div className="space-y-8">
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Asociar Producto Base</label>
                <input 
                  type="text"
                  placeholder="Escriba para buscar y precargar..."
                  value={calcSearch}
                  onChange={(e) => { setCalcSearch(e.target.value); setShowCalcSearch(e.target.value.length > 0); }}
                  className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none text-lg"
                />
                {showCalcSearch && (
                  <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-3xl shadow-2xl z-[130] max-h-56 overflow-auto custom-scrollbar">
                    {productos.filter(p => normalizeText(p.nombre).includes(normalizeText(calcSearch))).map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => {
                          setCalcData({ nombre: p.nombre, precioUnitario: p.precio_venta_publico, cantidad: 1 });
                          setCalcSearch(p.nombre);
                          setShowCalcSearch(false);
                        }}
                        className="w-full p-5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b last:border-0 border-gray-50 dark:border-gray-700 font-bold text-sm uppercase tracking-tight"
                      >
                        {p.nombre} (${formatCurrency(p.precio_venta_publico)} unit.)
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-8 border-t border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Descripción Personalizada</label>
                <input 
                  value={calcData.nombre} 
                  onChange={e => setCalcData({...calcData, nombre: e.target.value})} 
                  className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl font-black text-xl italic tracking-tight border-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Precio Base ($)</label>
                  <input type="number" value={calcData.precioUnitario} onChange={e => setCalcData({...calcData, precioUnitario: Number(e.target.value)})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl font-black text-2xl border-none text-blue-600" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Peso / Medida (kg/lt)</label>
                  <input type="number" step="0.001" value={calcData.cantidad} onChange={e => setCalcData({...calcData, cantidad: Number(e.target.value)})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl font-black text-2xl border-none" />
                </div>
              </div>

              <div className="p-10 bg-gray-900 text-white rounded-[2.5rem] text-center border-4 border-blue-600/20 shadow-2xl">
                <p className="text-blue-400 font-black uppercase text-[10px] tracking-[0.3em] mb-4">Total Proyectado</p>
                <p className="font-black text-6xl tracking-tighter italic">
                  ${formatCurrency(Math.round(calcData.precioUnitario * calcData.cantidad))}
                </p>
              </div>

              <div className="flex gap-4 pt-10">
                <button onClick={() => setIsCalcOpen(false)} className="flex-1 font-black text-gray-400 uppercase tracking-widest text-[10px]">Descartar</button>
                <button onClick={addVariableItem} className="flex-[3] py-6 bg-blue-600 text-white font-black rounded-3xl shadow-xl shadow-blue-200 dark:shadow-none hover:bg-blue-500 transition-all uppercase tracking-[0.2em] text-xs">Integrar a Carrito</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
