"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

type Producto = Database['public']['Tables']['Producto']['Row'];

interface CartItem {
  producto: Producto;
  cantidad: number;
}

export default function CatalogoPublico() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  
  // Checkout form
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [telefono, setTelefono] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('Producto')
      .select('*')
      .order('nombre');
      
    if (error) {
      console.error('Error fetching productos:', error);
    } else if (data) {
      setProductos(data);
    }
    setLoading(false);
  };

  const getStockStatus = (stock: number) => {
    if (stock <= 0) return { label: 'Agotado', color: 'text-red-400 bg-red-900/40 border border-red-800' };
    if (stock <= 5) return { label: 'Poco stock', color: 'text-orange-400 bg-orange-900/40 border border-orange-800' };
    return { label: 'Disponible', color: 'text-emerald-400 bg-emerald-900/40 border border-emerald-800' };
  };

  const addToCart = (producto: Producto) => {
    if (producto.stock_actual <= 0) return;

    setCart(prev => {
      const existing = prev.find(item => item.producto.id === producto.id);
      if (existing) {
        if (existing.cantidad >= producto.stock_actual) return prev;
        return prev.map(item =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...prev, { producto, cantidad: 1 }];
    });
    // NO se abre el carrito automáticamente: el usuario agrega y abre cuando quiera
  };

  const removeFromCart = (productoId: string) => {
    setCart(prev => prev.filter(item => item.producto.id !== productoId));
  };

  const updateQuantity = (productoId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.producto.id === productoId) {
        const newQ = item.cantidad + delta;
        if (newQ > 0 && newQ <= item.producto.stock_actual) {
          return { ...item, cantidad: newQ };
        }
      }
      return item;
    }));
  };

  const totalCart = cart.reduce((sum, item) => sum + (item.producto.precio_venta_publico * item.cantidad), 0);

  // ── Utilidades de RUT (idénticas a clientes/page.tsx) ──────────────────────
  const cleanRUT = (rut: string) => (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

  const validateRUT = (rut: string) => {
    const clean = cleanRUT(rut);
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body.charAt(i)) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const res = 11 - (sum % 11);
    const calculatedDV = res === 11 ? '0' : res === 10 ? 'K' : res.toString();
    return calculatedDV === dv;
  };

  const formatRUTVisual = (rut: string) => {
    const clean = cleanRUT(rut);
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let formatted = '';
    for (let i = body.length - 1, j = 1; i >= 0; i--, j++) {
      formatted = body.charAt(i) + formatted;
      if (j % 3 === 0 && i !== 0) formatted = '.' + formatted;
    }
    return `${formatted}-${dv}`;
  };
  // ────────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    // Normalizar datos antes de persistir
    const nombreFinal = nombre.trim().toUpperCase();
    const rutFinal    = formatRUTVisual(rut);

    if (!nombreFinal) {
      alert('El nombre es obligatorio.');
      return;
    }
    if (!validateRUT(rut)) {
      alert(`El RUT "${rutFinal}" no es válido. Verifica el dígito verificador.`);
      return;
    }

    setSubmitting(true);

    try {
      // 1. Insertar Pedido
      const { data: pedidoData, error: pedidoError } = await (supabase as any)
        .from('Pedido')
        .insert({
          nombre_cliente:   nombreFinal,
          rut_cliente:      rutFinal,
          telefono_cliente: telefono.trim(),
          estado: 'pendiente'
        })
        .select()
        .single();

      if (pedidoError) {
        console.error('[Pedido INSERT] Error detallado:', {
          message: pedidoError.message,
          details: pedidoError.details,
          hint:    pedidoError.hint,
          code:    pedidoError.code,
          raw:     pedidoError,
        });
        throw new Error(`Error al guardar el pedido: ${pedidoError.message}${pedidoError.hint ? ` — ${pedidoError.hint}` : ''}`);
      }

      // 2. Insertar DetallePedido
      const detalles = cart.map(item => ({
        pedido_id:      pedidoData.id,
        producto_id:    item.producto.id,
        cantidad:       item.cantidad,
        precio_unitario: item.producto.precio_venta_publico,
        subtotal:       item.producto.precio_venta_publico * item.cantidad,
      }));

      const { error: detalleError } = await (supabase as any)
        .from('DetallePedido')
        .insert(detalles);

      if (detalleError) {
        console.error('[DetallePedido INSERT] Error detallado:', {
          message: detalleError.message,
          details: detalleError.details,
          hint:    detalleError.hint,
          code:    detalleError.code,
          raw:     detalleError,
        });
        throw new Error(`Error al guardar el detalle del pedido: ${detalleError.message}${detalleError.hint ? ` — ${detalleError.hint}` : ''}`);
      }

      setSuccess(true);
      setCart([]);
      setNombre('');
      setRut('');
      setTelefono('');

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[handleSubmit] Fallo completo:', err);
      alert(`Hubo un error al enviar tu pedido:\n\n${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-6 shadow-xl">
          <div className="w-20 h-20 bg-emerald-900/40 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-emerald-400 text-4xl">
            ✓
          </div>
          <h2 className="text-3xl font-black text-white">¡Lista Enviada!</h2>
          <p className="text-slate-300 text-lg">
            Tu lista de compra tentativa ha sido enviada a la tienda.
          </p>
          <div className="bg-blue-900/30 border border-blue-800 text-blue-200 p-4 rounded-xl text-base text-left">
            <strong>Recuerda:</strong> Esto no es una reserva y no garantiza stock. Los productos no han sido descontados. El pago y la compra final se realizarán cuando retires en tienda.
          </div>
          <button 
            onClick={() => setSuccess(false)}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors border border-blue-500 text-lg"
          >
            Volver al Catálogo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col md:flex-row text-slate-200">
      {/* Catálogo */}
      <div className={`flex-1 p-6 md:p-8 ${showCart ? 'hidden md:block' : 'block'}`}>
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">Catálogo</h1>
              <p className="text-slate-400 text-base md:text-lg">Selecciona los productos que planeas comprar en tienda.</p>
            </div>

            {/* Botón de lista — visible siempre en el header (desktop y mobile) */}
            <button
              className="bg-blue-600 text-white px-4 md:px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 border border-blue-500 shadow-lg text-base md:text-lg relative"
              onClick={() => setShowCart(true)}
            >
              <span>🛒</span>
              <span className="hidden sm:inline">Mi Lista</span>
              {cart.reduce((a, b) => a + b.cantidad, 0) > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                  {cart.reduce((a, b) => a + b.cantidad, 0)}
                </span>
              )}
            </button>
          </header>

          {/* Mensaje de advertencia obligatorio */}
          <div className="bg-blue-900/30 border border-blue-800 text-blue-200 p-4 md:p-5 rounded-xl mb-8 flex gap-3 md:gap-4 text-sm md:text-base">
            <span className="text-xl md:text-2xl mt-0.5 shrink-0">ℹ️</span>
            <div className="leading-relaxed">
              <strong className="text-white">Importante:</strong> Esta es una lista de compra tentativa para agilizar tu atención en tienda.
              <strong className="text-white"> NO constituye una reserva</strong>, no garantiza stock y los productos no se guardan. La compra solo se concreta al momento de la entrega y pago en la tienda física.
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20 text-blue-600">Cargando catálogo...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {productos.map(producto => {
                const status = getStockStatus(producto.stock_actual);
                const isOutOfStock = producto.stock_actual <= 0;
                const inCart = cart.find(i => i.producto.id === producto.id);

                return (
                  <div key={producto.id} className="bg-slate-800 rounded-2xl p-4 md:p-5 border border-slate-700 hover:border-slate-500 transition-all duration-300 flex flex-col">
                    <div className="aspect-square bg-slate-900/50 rounded-xl mb-3 md:mb-4 flex items-center justify-center text-4xl md:text-5xl overflow-hidden relative border border-slate-700/50">
                      📦
                      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] md:text-[11px] font-black uppercase tracking-wider ${status.color}`}>
                        {status.label}
                      </div>
                      {/* Badge cantidad en carrito */}
                      {inCart && (
                        <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                          x{inCart.cantidad} en lista
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col">
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">{producto.categoria}</p>
                      <h3 className="font-bold text-white text-sm md:text-lg mb-2 leading-tight line-clamp-2">{producto.nombre}</h3>
                      <div className="mt-auto flex items-end justify-between">
                        <span className="text-xl md:text-2xl font-black text-blue-400">
                          ${producto.precio_venta_publico.toLocaleString('es-CL')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => addToCart(producto)}
                      disabled={isOutOfStock}
                      className={`mt-4 w-full py-2.5 md:py-3 rounded-xl font-bold transition-all text-sm md:text-base border ${
                        isOutOfStock
                          ? 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed'
                          : inCart
                          ? 'bg-blue-700 border-blue-600 text-white hover:bg-blue-600 active:scale-95 shadow-sm'
                          : 'bg-slate-700 border-slate-600 text-white hover:bg-blue-600 hover:border-blue-500 active:scale-95 shadow-sm'
                      }`}
                    >
                      {isOutOfStock ? 'Agotado' : inCart ? `+ Agregar otra` : 'Agregar a la Lista'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Botón flotante mobile — visible solo en mobile cuando hay productos en el carrito y el carrito está cerrado */}
      {cart.length > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-4 md:hidden z-40 bg-blue-600 text-white px-5 py-3.5 rounded-2xl font-black text-sm shadow-2xl shadow-blue-900/60 flex items-center gap-3 border border-blue-500 animate-bounce"
        >
          <span className="text-xl">🛒</span>
          Ver lista ({cart.reduce((a, b) => a + b.cantidad, 0)} items)
        </button>
      )}

      {/* Sidebar Carrito */}
      {showCart && (
        <div className="fixed inset-0 bg-slate-900 z-50 md:static md:w-96 md:bg-slate-800 md:border-l md:border-slate-700 flex flex-col h-screen">
          <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 sticky top-0 z-10">
            <h2 className="text-2xl font-black text-white">Tu Lista</h2>
            <button 
              className="text-slate-400 hover:text-red-400 transition-colors p-2 md:hidden"
              onClick={() => setShowCart(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <span className="text-6xl">🛒</span>
                <p className="text-lg">Tu lista está vacía</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map(item => (
                  <div key={item.producto.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex gap-4">
                    <div className="flex-1">
                      <h4 className="font-bold text-base text-white line-clamp-2">{item.producto.nombre}</h4>
                      <div className="text-blue-400 font-bold mt-1 text-base">
                        ${item.producto.precio_venta_publico.toLocaleString('es-CL')}
                      </div>
                      <div className="flex items-center gap-4 mt-4">
                        <div className="flex items-center bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                          <button onClick={() => updateQuantity(item.producto.id, -1)} className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold text-lg">−</button>
                          <span className="px-3 font-bold text-base w-10 text-center text-white">{item.cantidad}</span>
                          <button onClick={() => updateQuantity(item.producto.id, 1)} className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold text-lg">+</button>
                        </div>
                        <button onClick={() => removeFromCart(item.producto.id)} className="text-sm text-red-400 hover:text-red-300 hover:underline font-medium">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {cart.length > 0 && (
            <div className="p-6 bg-slate-800 border-t border-slate-700 shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <span className="text-slate-300 font-bold text-lg">Total estimado</span>
                <span className="text-3xl font-black text-white">${totalCart.toLocaleString('es-CL')}</span>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Tu Nombre Completo"
                  required
                  value={nombre}
                  onChange={e => setNombre(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-base uppercase"
                />
                <input
                  type="text"
                  placeholder="RUT (Ej: 12.345.678-9)"
                  required
                  value={rut}
                  onChange={e => setRut(e.target.value)}
                  onBlur={e => setRut(formatRUTVisual(e.target.value))}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-base"
                />
                <input
                  type="tel"
                  placeholder="Número de Teléfono"
                  required
                  value={telefono}
                  onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-base"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-4 rounded-xl font-black text-base uppercase tracking-wider transition-all mt-2 border ${
                    submitting ? 'bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed' : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                  }`}
                >
                  {submitting ? 'Enviando...' : 'Enviar Lista'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setShowCart(false);
                  }}
                  className="w-full py-2.5 text-red-400 text-base font-bold hover:text-red-300 hover:underline"
                >
                  Cancelar Pedido
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
