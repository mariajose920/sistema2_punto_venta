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
    if (stock <= 0) return { label: 'Agotado', color: 'text-red-600 bg-red-100' };
    if (stock <= 5) return { label: 'Poco stock', color: 'text-orange-600 bg-orange-100' };
    return { label: 'Disponible', color: 'text-emerald-600 bg-emerald-100' };
  };

  const addToCart = (producto: Producto) => {
    if (producto.stock_actual <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.producto.id === producto.id);
      if (existing) {
        // We do not check max stock as per instructions ("no mostrar stock exacto al cliente público")
        // but we should logically limit it to stock_actual if we want to be safe, however
        // we'll just increment it. We'll cap it at stock_actual.
        if (existing.cantidad >= producto.stock_actual) return prev;
        
        return prev.map(item => 
          item.producto.id === producto.id 
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...prev, { producto, cantidad: 1 }];
    });
    setShowCart(true);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    
    setSubmitting(true);
    
    try {
      // 1. Insert Pedido
      const { data: pedidoData, error: pedidoError } = await (supabase as any)
        .from('Pedido')
        .insert({
          nombre_cliente: nombre,
          rut_cliente: rut,
          telefono_cliente: telefono,
          estado: 'pendiente'
        })
        .select()
        .single();
        
      if (pedidoError) throw pedidoError;
      
      // 2. Insert DetallePedido
      const detalles = cart.map(item => ({
        pedido_id: pedidoData.id,
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio_venta_publico,
        subtotal: item.producto.precio_venta_publico * item.cantidad
      }));
      
      const { error: detalleError } = await (supabase as any)
        .from('DetallePedido')
        .insert(detalles);
        
      if (detalleError) throw detalleError;
      
      setSuccess(true);
      setCart([]);
      setNombre('');
      setRut('');
      setTelefono('');
      
    } catch (error) {
      console.error('Error al enviar el pedido:', error);
      alert('Hubo un error al enviar tu pedido. Por favor intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-500 text-4xl">
            ✓
          </div>
          <h2 className="text-3xl font-black text-gray-900">¡Lista Enviada!</h2>
          <p className="text-gray-600">
            Tu lista de compra tentativa ha sido enviada a la tienda.
          </p>
          <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl text-sm text-left">
            <strong>Recuerda:</strong> Esto no es una reserva y no garantiza stock. Los productos no han sido descontados. El pago y la compra final se realizarán cuando retires en tienda.
          </div>
          <button 
            onClick={() => setSuccess(false)}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Volver al Catálogo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Catálogo */}
      <div className={`flex-1 p-6 md:p-8 ${showCart ? 'hidden md:block' : 'block'}`}>
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2">Catálogo</h1>
              <p className="text-gray-500">Selecciona los productos que planeas comprar en tienda.</p>
            </div>
            <button 
              className="md:hidden bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg"
              onClick={() => setShowCart(true)}
            >
              <span>🛒</span> Cart ({cart.reduce((a, b) => a + b.cantidad, 0)})
            </button>
          </header>
          
          {/* Mensaje de advertencia obligatorio */}
          <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl mb-8 flex gap-3 text-sm md:text-base">
            <span className="text-xl">ℹ️</span>
            <div>
              <strong>Importante:</strong> Esta es una lista de compra tentativa para agilizar tu atención en tienda. 
              <strong> NO constituye una reserva</strong>, no garantiza stock y los productos no se guardan. La compra solo se concreta al momento de la entrega y pago en la tienda física.
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20 text-blue-600">Cargando catálogo...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {productos.map(producto => {
                const status = getStockStatus(producto.stock_actual);
                const isOutOfStock = producto.stock_actual <= 0;
                
                return (
                  <div key={producto.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 flex flex-col">
                    <div className="aspect-square bg-gray-100 rounded-xl mb-4 flex items-center justify-center text-4xl overflow-hidden relative">
                      {/* Placeholder imagen */}
                      📦
                      <div className={`absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${status.color}`}>
                        {status.label}
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">{producto.categoria}</p>
                      <h3 className="font-bold text-gray-900 mb-2 leading-tight">{producto.nombre}</h3>
                      <div className="mt-auto flex items-end justify-between">
                        <span className="text-xl font-black text-blue-600">
                          ${producto.precio_venta_publico.toLocaleString('es-CL')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => addToCart(producto)}
                      disabled={isOutOfStock}
                      className={`mt-4 w-full py-2.5 rounded-xl font-bold transition-all ${
                        isOutOfStock 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-gray-900 text-white hover:bg-blue-600 active:scale-95 shadow-md'
                      }`}
                    >
                      {isOutOfStock ? 'Agotado' : 'Agregar a la Lista'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Carrito */}
      {showCart && (
        <div className="fixed inset-0 bg-white z-50 md:static md:w-96 md:bg-white md:border-l md:border-gray-200 md:shadow-2xl flex flex-col h-screen">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
            <h2 className="text-2xl font-black text-gray-900">Tu Lista</h2>
            <button 
              className="text-gray-400 hover:text-red-500 transition-colors p-2 md:hidden"
              onClick={() => setShowCart(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <span className="text-5xl">🛒</span>
                <p>Tu lista está vacía</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map(item => (
                  <div key={item.producto.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4">
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-gray-900 line-clamp-2">{item.producto.nombre}</h4>
                      <div className="text-blue-600 font-bold mt-1 text-sm">
                        ${item.producto.precio_venta_publico.toLocaleString('es-CL')}
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                          <button onClick={() => updateQuantity(item.producto.id, -1)} className="px-2 py-1 text-gray-600 hover:bg-gray-200 font-bold">−</button>
                          <span className="px-2 font-bold text-sm w-8 text-center">{item.cantidad}</span>
                          <button onClick={() => updateQuantity(item.producto.id, 1)} className="px-2 py-1 text-gray-600 hover:bg-gray-200 font-bold">+</button>
                        </div>
                        <button onClick={() => removeFromCart(item.producto.id)} className="text-xs text-red-500 hover:underline font-medium">
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
            <div className="p-6 bg-white border-t border-gray-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-500 font-bold">Total estimado</span>
                <span className="text-2xl font-black text-gray-900">${totalCart.toLocaleString('es-CL')}</span>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Tu Nombre Completo"
                  required
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                />
                <input
                  type="text"
                  placeholder="RUT (Ej: 12.345.678-9)"
                  required
                  value={rut}
                  onChange={e => setRut(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                />
                <input
                  type="tel"
                  placeholder="Número de Teléfono"
                  required
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3.5 rounded-xl font-black uppercase tracking-wider transition-all mt-2 ${
                    submitting ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg shadow-blue-200'
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
                  className="w-full py-2 text-red-500 text-sm font-bold hover:underline"
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
