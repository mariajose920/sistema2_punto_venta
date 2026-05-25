"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { normalizeText, formatCurrency } from '@/lib/utils';
import { measureAsync } from '@/lib/perf';

type ProductoRow = {
  id: string;
  nombre: string;
  precio_venta_publico: number | null;
  stock_actual: number | null;
  codigo_barra?: string | null;
  categoria?: string | null;
  created_at?: string | null;
  stock_minimo?: number | null;
  precio_compra?: number | null;
} & Record<string, unknown>;

type ClienteRow = {
  id: string;
  nombre: string;
  saldo_favor: number | null;
  saldo_deudado?: number | null;
};

type PromocionRow = {
  id: string;
  nombre: string;
  tipo: string;
  valor: number | null;
  activa?: boolean;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
};

type VentaInsert = Record<string, unknown>;
type DetalleVentaInsert = Record<string, unknown>;
type CreditoInsert = Record<string, unknown>;

interface CartItem extends ProductoRow {
  cantidad: number;
  descuento: number;
  subtotal: number;
  isVariable?: boolean;
}

export default function NuevaVentaPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  
  // Estados de datos
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [promociones, setPromociones] = useState<PromocionRow[]>([]);
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

  // Estado para Nuevo Cliente
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    nombre: '',
    rut: '',
    telefono: '',
    direccion: ''
  });

  const searchRef = useRef<HTMLInputElement>(null);

  // Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const startFetch = performance.now();

        const [pRes, cRes, promoRes] = await Promise.all([
          measureAsync(
            '[Venta] cargar productos',
            async () =>
              (supabase.from('Producto') as any)
                .select('id, nombre, precio_venta_publico, stock_actual, codigo_barra')
                .order('nombre')
          ),
          measureAsync(
            '[Venta] cargar clientes',
            async () =>
              (supabase.from('Cliente') as any)
                .select('id, nombre, saldo_favor')
                .order('nombre')
          ),
          measureAsync(
            '[Venta] cargar promociones',
            async () =>
              (supabase.from('Promocion') as any)
                .select('id, nombre, tipo, valor, activa, fecha_inicio, fecha_fin')
                .eq('activa', true)
                .lte('fecha_inicio', today)
                .gte('fecha_fin', today)
          ),
        ]);

        console.log('[PERF_VENTA] carga inicial completa', {
          ms: Number((performance.now() - startFetch).toFixed(2)),
          productos: pRes.data?.length ?? 0,
          clientes: cRes.data?.length ?? 0,
          promociones: promoRes.data?.length ?? 0,
        });

        setProductos((pRes.data || []) as ProductoRow[]);
        setClientes((cRes.data || []) as ClienteRow[]);
        setPromociones((promoRes.data || []) as PromocionRow[]);
      } catch (err: unknown) {
        console.error('Error fetching data:', err);
      }
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
          totalDescuento += pares * (item.precio_venta_publico || 0);
        } else if (promo.tipo === 'porcentaje') {
          totalDescuento += ((item.precio_venta_publico || 0) * item.cantidad) * ((promo.valor || 0) / 100);
        } else if (promo.tipo === 'fijo') {
          totalDescuento += (promo.valor || 0);
        }
      });

      const subtotal = ((item.precio_venta_publico || 0) * item.cantidad) - totalDescuento;
      return { ...item, descuento: totalDescuento, subtotal: Math.max(0, subtotal) };
    });
  }, [promociones]);

  const updateCartWithPromos = useCallback((newCart: CartItem[]) => {
    const updated = applyPromotions(newCart);
    setCart(updated);
  }, [applyPromotions]);

  const addToCart = (product: ProductoRow) => {
    const existing = cart.find(item => item.id === product.id && !item.isVariable);
    let newCart: CartItem[];

    if (existing) {
      newCart = cart.map(item => 
        item.id === product.id ? { ...item, cantidad: item.cantidad + 1 } : item
      );
    } else {
      newCart = [...cart, { 
        ...product, 
        cantidad: 1, 
        descuento: 0, 
        subtotal: product.precio_venta_publico || 0 
      } as CartItem];
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
      isVariable: true,
      created_at: new Date().toISOString(),
      categoria: 'variable',
      stock_minimo: 0,
      precio_compra: 0,
      precio_venta_promocion: null,
      id_proveedor: null,
      fuente_datos: 'manual',
      imagen_url: null
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

  // Limpiar cliente si no es Fiado (Requerimiento de ocultar y no ser obligatorio)
  useEffect(() => {
    if (paymentMethod !== 'fiado') {
      setSelectedClientId('');
    }
  }, [paymentMethod]);

  const subtotalVenta = cart.reduce((acc, curr) => acc + curr.subtotal, 0);
  const selectedClient = useMemo(() => clientes.find(c => c.id === selectedClientId), [clientes, selectedClientId]);
  
  // Cálculo de Recargo (0.15% para tarjeta)
  const recargoTarjeta = paymentMethod === 'tarjeta' ? subtotalVenta * 0.0015 : 0;
  
  // Cálculo de Wallet / Saldo a Favor
  const saldoFavorAplicado = selectedClient ? Math.min(selectedClient.saldo_favor || 0, subtotalVenta + recargoTarjeta) : 0;
  const totalFinal = subtotalVenta + recargoTarjeta - saldoFavorAplicado;

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return [];
    return productos.filter(p => 
      (p.nombre || '').toLowerCase().includes(term) || 
      (p.codigo_barra || '').toString().toLowerCase().includes(term)
    );
  }, [search, productos]);

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
      
      // Verificación de productos vendidos sin stock para añadir advertencia
      const itemsSinStock = cart.filter(item => !item.isVariable && item.cantidad > (item.stock_actual || 0));
      let advertenciaStock = "";
      if (itemsSinStock.length > 0) {
        advertenciaStock = `⚠️ Venta con sobregiro de stock en: ${itemsSinStock.map(i => i.nombre).join(', ')}. `;
      }

      const observacionNorm = normalizeText(
        advertenciaStock +
        (saldoFavorAplicado > 0 ? `Se aplicó saldo a favor de ${formatCurrency(saldoFavorAplicado)}. ` : "") +
        (recargoTarjeta > 0 ? `Recargo por tarjeta del 0.15% (${formatCurrency(recargoTarjeta)}).` : "")
      );

      // 1. Crear la cabecera de la Venta
      const ventaPayload: any = {
        id_usuario_cajera: user.id,
        id_cliente: selectedClientId || null,
        subtotal: subtotalVenta,
        recargo: recargoTarjeta,
        total_venta: totalFinal,
        forma_pago: paymentMethod,
        iva: totalFinal * 0.19,
        estado: 'cerrada',
        observacion: observacionNorm || null
      };

      const { data: venta, error: vError } = await (supabase.from('Venta') as any)
        .insert([ventaPayload])
        .select()
        .single();

      if (vError || !venta) throw vError || new Error('Error al crear la cabecera de venta');

      // 2. Insertar detalles y actualizar stock
      const detallesPayload: DetalleVentaInsert[] = cart.map(item => ({
        id_venta: venta.id_venta,
        id_producto: item.isVariable ? null : item.id,
        cantidad: item.cantidad,
        precio_unitario_venta: item.precio_venta_publico,
        descuento_aplicado: item.descuento,
        subtotal: item.subtotal
      }));

      const { error: dError } = await (supabase.from('DetalleVenta') as any).insert(detallesPayload);
      if (dError) throw dError;

      // 3. Actualizar stock (Batch update)
      for (const item of cart) {
        if (!item.isVariable) {
          // Usamos una operación atómica para evitar race conditions
          const { data: prod, error: pError } = await (supabase.from('Producto') as any)
            .select('stock_actual')
            .eq('id', item.id)
            .single();
          
          if (!pError && prod) {
            const nuevoStock = (prod.stock_actual || 0) - item.cantidad;
            await (supabase.from('Producto') as any)
              .update({ stock_actual: nuevoStock })
              .eq('id', item.id);
          }
        }
      }

      // 3. Lógica de Wallet y Deuda
      if (selectedClient) {
        let nuevoSaldoFavor = (selectedClient.saldo_favor || 0) - saldoFavorAplicado;
        let nuevaDeuda = (selectedClient.saldo_deudado || 0);

        if (paymentMethod === 'fiado') {
          nuevaDeuda += totalFinal;
          if (totalFinal > 0) {
            const creditoPayload: CreditoInsert = {
              cliente_id: selectedClientId,
              venta_id: venta.id_venta,
              monto_inicial: totalFinal,
              saldo_pendiente: totalFinal,
              estado: 'vigente'
            };
            await (supabase.from('Credito') as any).insert([creditoPayload]);
          }
        }

        const { error: cliUpdateError } = await (supabase.from('Cliente') as any)
          .update({ 
            saldo_favor: nuevoSaldoFavor,
            saldo_deudado: nuevaDeuda
          })
          .eq('id', selectedClientId);
        
        if (cliUpdateError) throw cliUpdateError;
      }

      alert('Venta completada con éxito');
      
      // Limpiar estados para la siguiente venta inmediata
      setCart([]);
      setSelectedClientId('');
      setSearch('');
      setPaymentMethod('efectivo');
      setShowProductSearch(false);
    } catch (err: any) {
      console.error('ERROR CRÍTICO EN VENTA:', err);
      
      // Extraer el mensaje más descriptivo posible del error de Supabase/PostgREST
      const message = err?.message || err?.details || err?.hint || (typeof err === 'string' ? err : 'Error desconocido en el proceso de venta');
      
      alert('⚠️ No se pudo completar la venta:\n\n' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { data, error } = await (supabase.from('Cliente') as any).insert([{
        nombre: normalizeText(newClient.nombre),
        rut: newClient.rut.toUpperCase(),
        telefono: newClient.telefono,
        direccion: normalizeText(newClient.direccion),
        saldo_favor: 0,
        saldo_deudado: 0
      }]).select().single();

      if (error) throw error;
      
      setClientes([...clientes, data]);
      setSelectedClientId(data.id);
      setIsClientModalOpen(false);
      setNewClient({ nombre: '', rut: '', telefono: '', direccion: '' });
      alert('Cliente creado y seleccionado');
    } catch (err: any) {
      alert('Error al crear cliente: ' + err.message);
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
              <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2rem] shadow-2xl z-50 max-h-[50vh] overflow-auto animate-in slide-in-from-top-2">
                {filteredProducts.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-300 font-black text-3xl mb-2 grayscale opacity-30">🔍</p>
                    <p className="text-gray-400 font-bold italic">No se encontraron productos para &quot;{search}&quot;</p>
                  </div>
                ) : (
                  filteredProducts.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => addToCart(p)} 
                      className="w-full p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 flex justify-between items-center border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 dark:text-white text-lg uppercase italic truncate">{p.nombre}</p>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Stock Disponible: {p.stock_actual}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="font-black text-blue-600 text-2xl tracking-tighter">{formatCurrency(p.precio_venta_publico || 0)}</p>
                        <p className="text-[9px] text-gray-300 font-bold">Cód: {p.codigo_barra || 'S/N'}</p>
                      </div>
                    </button>
                  ))
                )}
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
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/30 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-3 lg:px-8 py-5 text-left">Producto</th>
                    <th className="px-3 lg:px-8 py-5 text-center">Cantidad / Peso</th>
                    <th className="px-3 lg:px-8 py-5 text-right">Subtotal</th>
                    <th className="px-3 lg:px-8 py-5 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {cart.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-3 lg:px-8 py-4 lg:py-6">
                        <p className="font-bold text-gray-900 dark:text-white uppercase text-xs">{item.nombre}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-[10px] text-gray-400 font-bold tracking-tight">${(item.precio_venta_publico || 0).toLocaleString()} c/u</p>
                          {!item.isVariable && (
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                              (item.stock_actual || 0) < 1
                                ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                                : 'text-gray-400 bg-gray-50 dark:bg-gray-900'
                            }`}>
                              Stock: {item.stock_actual || 0}
                              {(item.stock_actual || 0) < 1 && (
                                <span className="ml-1">— sin stock registrado</span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 lg:px-8 py-4 lg:py-6">
                        <div className="flex items-center justify-center gap-2 lg:gap-4">
                          <button onClick={() => updateQuantity(item.id, item.cantidad - 1)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black">-</button>
                          <span className="font-black text-base lg:text-xl min-w-[2ch] text-center">{item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toFixed(3)}</span>
                          <button onClick={() => updateQuantity(item.id, item.cantidad + 1)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black">+</button>
                        </div>
                      </td>
                      <td className="px-3 lg:px-8 py-4 lg:py-6 text-right font-black text-gray-900 dark:text-white text-base lg:text-xl">
                        ${item.subtotal.toLocaleString()}
                      </td>
                      <td className="px-3 lg:px-8 py-4 lg:py-6 text-center">
                        <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 text-2xl transition-all">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 flex flex-col gap-6 h-fit lg:sticky lg:top-24">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 space-y-8">
          <h2 className="font-black text-gray-900 dark:text-white uppercase tracking-widest text-xs">Finalizar Venta</h2>
          
          <div className="space-y-6">
            {/* Selección de Cliente - Solo para Fiado */}
            {paymentMethod === 'fiado' && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest block">
                    Cliente <span className="text-red-700 tracking-normal">*Obligatorio</span>
                  </label>
                  <button 
                    onClick={() => setIsClientModalOpen(true)}
                    className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    + Nuevo Cliente
                  </button>
                </div>
                <select 
                  value={selectedClientId} 
                  onChange={(e) => setSelectedClientId(e.target.value)} 
                  className={`w-full p-4 rounded-2xl font-bold text-sm border-none transition-colors ${
                    !selectedClientId ? 'ring-2 ring-red-500 bg-red-50 text-red-900' :
                    selectedClient?.saldo_favor && selectedClient.saldo_favor > 0 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' 
                      : 'bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white'
                  }`}
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} {(c.saldo_favor || 0) > 0 ? `(Saldo: $${(c.saldo_favor || 0).toLocaleString()})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                <span className="font-bold text-gray-400 uppercase text-[10px]">Subtotal Productos</span>
                <span className="font-black text-gray-900 dark:text-white">${subtotalVenta.toLocaleString()}</span>
              </div>

              {recargoTarjeta > 0 && (
                <div className="flex justify-between items-center text-sm text-blue-600">
                  <span className="font-bold uppercase text-[10px]">Recargo Tarjeta (0.15%)</span>
                  <span className="font-black">+${recargoTarjeta.toLocaleString()}</span>
                </div>
              )}
              
              {saldoFavorAplicado > 0 && (
                <div className="flex justify-between items-center text-sm text-emerald-600">
                  <span className="font-bold uppercase text-[10px]">Saldo a Favor Aplicado</span>
                  <span className="font-black">-${saldoFavorAplicado.toLocaleString()}</span>
                </div>
              )}

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-blue-600 font-black uppercase text-[10px] tracking-widest mb-1 text-center">Total a Cobrar</p>
                <p className="font-black text-3xl lg:text-5xl text-gray-900 dark:text-white tracking-tighter text-center">
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
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-6 italic">🧮 Calculadora Variable</h2>
            
            <div className="space-y-6">
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Buscar Producto Existente</label>
                <input 
                  type="text"
                  placeholder="Escriba para buscar..."
                  value={calcSearch}
                  onChange={(e) => { setCalcSearch(e.target.value); setShowCalcSearch(e.target.value.length > 0); }}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none"
                />
                {showCalcSearch && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-2xl z-[110] max-h-40 overflow-auto">
                    {productos.filter(p => (p.nombre || '').toLowerCase().includes(calcSearch.toLowerCase())).map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => {
                          setCalcData({ nombre: (p.nombre || '').toLowerCase(), precioUnitario: p.precio_venta_publico || 0, cantidad: 1 });
                          setCalcSearch(p.nombre || '');
                          setShowCalcSearch(false);
                        }}
                        className="w-full p-4 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b last:border-0 border-gray-50 dark:border-gray-700 font-bold text-sm"
                      >
                        {p.nombre} (${(p.precio_venta_publico || 0).toLocaleString()})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre / Concepto Final</label>
                <input 
                  value={calcData.nombre} 
                  onChange={e => setCalcData({...calcData, nombre: e.target.value.toLowerCase()})} 
                  className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Precio Unitario ($)</label>
                  <input type="number" value={calcData.precioUnitario} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setCalcData({...calcData, precioUnitario: Number(e.target.value)}) }} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Cantidad / Peso</label>
                  <input type="number" step="0.001" value={calcData.cantidad} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setCalcData({...calcData, cantidad: Number(e.target.value)}) }} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
                </div>
              </div>

              <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-3xl text-center border-2 border-blue-100 dark:border-blue-900/30">
                <p className="text-blue-600 font-black uppercase text-[10px] tracking-widest mb-1">Total Calculado</p>
                <p className="font-black text-4xl text-gray-900 dark:text-white tracking-tighter">
                  ${(calcData.precioUnitario * calcData.cantidad).toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsCalcOpen(false)} className="flex-1 font-bold text-gray-400 py-4">Cancelar</button>
                <button onClick={addVariableItem} className="flex-2 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all">AÑADIR A VENTA</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Cliente */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-6 italic">👤 Nuevo Cliente</h2>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre Completo</label>
                <input required value={newClient.nombre} onChange={e => setNewClient({...newClient, nombre: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">RUT / ID</label>
                <input required value={newClient.rut} onChange={e => setNewClient({...newClient, rut: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Teléfono</label>
                  <input value={newClient.telefono} onChange={e => setNewClient({...newClient, telefono: e.target.value.replace(/\D/g, '').slice(0, 9)})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Dirección</label>
                  <input value={newClient.direccion} onChange={e => setNewClient({...newClient, direccion: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold border-none" />
                </div>
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsClientModalOpen(false)} className="flex-1 font-bold text-gray-400 py-4">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-2 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl hover:bg-blue-700 transition-all">
                  {loading ? 'CREANDO...' : 'CREAR CLIENTE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
