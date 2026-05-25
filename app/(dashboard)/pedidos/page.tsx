"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

type PedidoCompleto = {
  id: string;
  nombre_cliente: string;
  rut_cliente: string;
  telefono_cliente: string;
  estado: string;
  created_at: string;
  detalles: any[];
};

const allowedPaymentMethods = ['efectivo', 'tarjeta', 'transferencia', 'fiado'] as const;
type FormaPagoVenta = (typeof allowedPaymentMethods)[number];

function normalizeFormaPago(value: string): FormaPagoVenta {
  const normalized = value.trim().toLowerCase();

  if ((allowedPaymentMethods as readonly string[]).includes(normalized)) {
    return normalized as FormaPagoVenta;
  }

  throw new Error(`Método de pago inválido: ${value}`);
}

export default function PedidosPage() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Delivery Modal State
  const [selectedPedido, setSelectedPedido] = useState<PedidoCompleto | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPedidos();
    
    // Polling for new orders
    const interval = setInterval(() => {
      fetchPedidos(true);
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchPedidos = async (silent = false) => {
    if (!silent) setLoading(true);
    
    const { data: pedidosData, error: pedidosError } = await (supabase as any)
      .from('Pedido')
      .select('*')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });
      
    if (pedidosError) {
      console.error(pedidosError);
      if (!silent) setLoading(false);
      return;
    }

    const { data: detallesData, error: detallesError } = await (supabase as any)
      .from('DetallePedido')
      .select(`
        *,
        Producto (
          nombre,
          precio_venta_publico,
          stock_actual
        )
      `);
      
    if (detallesError) {
      console.error(detallesError);
      if (!silent) setLoading(false);
      return;
    }

    const pedidosCompletos = (pedidosData as any[]).map(p => ({
      ...p,
      detalles: (detallesData as any[]).filter(d => d.pedido_id === p.id)
    }));

    // Check for new orders if silent
    if (silent && pedidos.length > 0 && pedidosCompletos.length > pedidos.length) {
      // Notificación visual (básica en browser)
      if (Notification.permission === 'granted') {
        new Notification('¡Nuevo Pedido Recibido!', {
          body: 'Ha ingresado un nuevo pedido web.'
        });
      } else {
        alert('¡Nuevo Pedido Recibido!');
      }
    }

    setPedidos(pedidosCompletos);
    if (!silent) setLoading(false);
  };

  const fetchClientes = async () => {
    const { data } = await supabase.from('Cliente').select('*').order('nombre');
    if (data) setClientes(data);
  };

  const openDeliveryModal = (pedido: PedidoCompleto) => {
    setSelectedPedido(pedido);
    setPaymentMethod('efectivo');
    setSelectedClientId('');
    fetchClientes();
  };

  const handleCancel = async (id: string) => {
    if (!confirm('¿Estás seguro de cancelar este pedido? Se eliminará del sistema.')) return;
    
    const { error } = await (supabase as any).from('Pedido').delete().eq('id', id);
    if (!error) {
      setPedidos(pedidos.filter(p => p.id !== id));
    } else {
      alert('Error al cancelar el pedido');
    }
  };

  const handleDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPedido || !user) return;

    const formaPago = normalizeFormaPago(paymentMethod);

    if (formaPago === 'fiado' && !selectedClientId) {
      alert('Debes seleccionar un cliente para fiar.');
      return;
    }

    setProcessing(true);
    try {
      console.log('Iniciando procesamiento de entrega...', {
         pedidoId: selectedPedido.id,
         usuarioId: user.id,
         formaPago,
         selectedClientId
      });

      const { data, error } = await (supabase as any).rpc('procesar_entrega_pedido', {
        p_pedido_id: selectedPedido.id,
        p_usuario_id: user.id,
        p_forma_pago: formaPago,
        p_cliente_id: selectedClientId || null
      });

      if (error) {
        console.error('Error de Supabase RPC:', error);
        throw new Error(error.message || 'Error en la base de datos al procesar la entrega.');
      }

      console.log('Entrega procesada con éxito:', data);

      setSelectedPedido(null);
      fetchPedidos(true);
      alert('Venta generada y pedido entregado con éxito');

    } catch (err: any) {
      console.error('Error capturado al procesar la entrega:', err);
      alert(`Error al procesar la entrega: ${err.message || 'Revisa la consola.'}`);
    } finally {
      setProcessing(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'Cliente', 'RUT', 'Teléfono', 'Productos', 'Total'];
    const rows = pedidos.map(p => {
      const total = p.detalles.reduce((sum, d) => sum + d.subtotal, 0);
      const prods = p.detalles.map(d => `${d.cantidad}x ${d.Producto?.nombre || '?'}`).join(', ');
      return [
        new Date(p.created_at).toLocaleString(),
        p.nombre_cliente,
        p.rut_cliente,
        p.telefono_cliente,
        `"${prods}"`,
        total
      ].join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "pedidos_pendientes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    // Pedir permiso para notificaciones si se desea
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Pedidos Web ({pedidos.length})</h1>
          <p className="text-gray-500">Gestión de listas de compra tentativas.</p>
        </div>
        <button 
          onClick={exportToCSV}
          className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-green-700 transition-colors shadow-sm"
        >
          Exportar CSV
        </button>
      </div>

      {loading ? (
        <p>Cargando pedidos...</p>
      ) : pedidos.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-lg">No hay pedidos pendientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pedidos.map(pedido => {
            const total = pedido.detalles.reduce((sum, d) => sum + d.subtotal, 0);
            return (
              <div key={pedido.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{pedido.nombre_cliente}</h3>
                    <p className="text-sm text-gray-500">RUT: {pedido.rut_cliente} | Tel: {pedido.telefono_cliente}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(pedido.created_at).toLocaleString()}</p>
                  </div>
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                    {pedido.estado}
                  </span>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
                  <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Productos</h4>
                  {pedido.detalles.map(det => (
                    <div key={det.id} className="flex justify-between text-sm">
                      <span>{det.cantidad}x {det.Producto?.nombre || 'Producto Desconocido'}</span>
                      <span className="font-medium">${det.subtotal.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-gray-200 flex justify-between font-black text-gray-900">
                    <span>Total Estimado</span>
                    <span className="text-blue-600">${total.toLocaleString('es-CL')}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => openDeliveryModal(pedido)}
                    className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    Marcar como Entregado
                  </button>
                  <button 
                    onClick={() => handleCancel(pedido.id)}
                    className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Entrega */}
      {selectedPedido && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-gray-900">Finalizar Entrega</h2>
              <button onClick={() => setSelectedPedido(null)} className="text-gray-400 hover:text-red-500">✕</button>
            </div>
            
            <form onSubmit={handleDelivery} className="p-6 space-y-6">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-100">
                Al confirmar la entrega, se generará una venta normal y se descontará el stock de los productos.
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Método de Pago</label>
                <select 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="fiado">Fiado</option>
                </select>
              </div>

              {paymentMethod === 'fiado' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Seleccionar Cliente para Fiado</label>
                  <select 
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer"
                    required
                  >
                    <option value="" className="text-gray-400">-- Selecciona un cliente --</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id} className="text-gray-900">{c.nombre} ({c.rut})</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">Si el cliente no existe, debes crearlo primero en el módulo de clientes.</p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setSelectedPedido(null)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={processing}
                  className={`flex-1 px-4 py-3 rounded-xl font-bold text-white transition-colors ${
                    processing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200'
                  }`}
                >
                  {processing ? 'Procesando...' : 'Confirmar y Generar Venta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
