"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { BoletaDocumento, printBoleta } from '@/lib/boletas';

interface Venta {
  id_venta: string;
  fecha_venta: string;
  total_venta: number;
  forma_pago: string;
  estado: string;
  observacion: string;
  subtotal: number;
  recargo: number;
  requiere_boleta?: boolean;
  estado_boleta?: 'pendiente' | 'emitida' | 'rechazada' | null;
  folio_boleta?: string | null;
  track_id_sii?: string | null;
  respuesta_sii?: unknown;
  fecha_emision_boleta?: string | null;
  url_pdf_boleta?: string | null;
  xml_boleta?: string | null;
  cliente?: { nombre: string };
  usuario?: { nombre: string };
}

interface Detalle {
  id_detalle_venta: string;
  id_producto: string;
  cantidad: number;
  precio_unitario_venta: number;
  subtotal: number;
  producto?: { nombre: string };
}

export default function HistorialVentasPage() {
  const { user, role } = useAuth();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [detalles, setDetalles] = useState<Detalle[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isInactiveOpen, setIsInactiveOpen] = useState(false);
  const [ventaToInactive, setVentaToInactive] = useState<Venta | null>(null);
  const [inactiveReason, setInactiveReason] = useState('');
  const [isReactivateOpen, setIsReactivateOpen] = useState(false);
  const [ventaToReactivate, setVentaToReactivate] = useState<Venta | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [boletaPreview, setBoletaPreview] = useState<BoletaDocumento | null>(null);
  const [search, setSearch] = useState('');

  const fetchVentas = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('Venta')
        .select(`
          *,
          cliente:Cliente(nombre),
          usuario:Usuario!Venta_id_usuario_cajera_fkey(nombre)
        `)
        .order('fecha_venta', { ascending: false });

      if (error) throw error;
      setVentas(data || []);
    } catch (err: any) {
      alert('Error al cargar ventas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  const openDetail = async (venta: Venta) => {
    setSelectedVenta(venta);
    setIsDetailOpen(true);
    try {
      const { data, error } = await (supabase as any)
        .from('DetalleVenta')
        .select(`
          *,
          producto:Producto!detalleventa_id_producto_fkey(nombre)
        `)
        .eq('id_venta', venta.id_venta);

      if (error) throw error;
      setDetalles(data || []);
    } catch (err: any) {
      console.error('Error al cargar detalle:', err);
    }
  };

  const loadBoletaDocument = async (venta: Venta, shouldPrint = false) => {
    if (!venta.requiere_boleta || venta.estado_boleta !== 'emitida') {
      alert('La venta no tiene una boleta emitida para mostrar.');
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('DetalleVenta')
        .select(`
          *,
          producto:Producto!detalleventa_id_producto_fkey(nombre)
        `)
        .eq('id_venta', venta.id_venta);

      if (error) throw error;

      const documento: BoletaDocumento = {
        venta,
        detalles: data || []
      };

      setBoletaPreview(documento);
      if (shouldPrint) {
        window.setTimeout(() => printBoleta(documento), 200);
      }
    } catch (err: any) {
      alert('No se pudo cargar la boleta: ' + (err?.message || err));
    }
  };

  const openInactiveModal = (venta: Venta) => {
    setVentaToInactive(venta);
    setInactiveReason('');
    setIsInactiveOpen(true);
  };

  const handleInactivarVenta = async () => {
    const motivo = inactiveReason.trim();
    if (!ventaToInactive || !user) return;
    if (!motivo) {
      alert('Debe escribir una justificación para inactivar la venta.');
      return;
    }

    try {
      setActionLoading(true);
      const { error } = await (supabase as any).rpc('inactivar_venta', {
        p_venta_id: ventaToInactive.id_venta,
        p_motivo: motivo,
        p_usuario_id: user.id
      });

      if (error) throw error;

      alert('Venta marcada como inactiva correctamente.');
      setIsInactiveOpen(false);
      setVentaToInactive(null);
      setInactiveReason('');
      setIsDetailOpen(false);
      setSelectedVenta(null);
      await fetchVentas();
    } catch (err: any) {
      alert('No se pudo inactivar la venta: ' + (err?.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const openReactivateModal = (venta: Venta) => {
    if (role !== 'admin') return;
    setVentaToReactivate(venta);
    setReactivateReason('');
    setIsReactivateOpen(true);
  };

  const handleReactivarVenta = async () => {
    if (!ventaToReactivate || !user || role !== 'admin') return;

    try {
      setActionLoading(true);
      const { error } = await (supabase as any).rpc('reactivar_venta', {
        p_venta_id: ventaToReactivate.id_venta,
        p_motivo: reactivateReason.trim() || null,
        p_usuario_id: user.id
      });

      if (error) throw error;

      alert('Venta reactivada correctamente.');
      setIsReactivateOpen(false);
      setVentaToReactivate(null);
      setReactivateReason('');
      setIsDetailOpen(false);
      setSelectedVenta(null);
      await fetchVentas();
    } catch (err: any) {
      alert('No se pudo reactivar la venta: ' + (err?.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const filteredVentas = ventas.filter(v => 
    v.id_venta.toLowerCase().includes(search.toLowerCase()) || 
    v.cliente?.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Historial de Ventas</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 italic">Registro completo de transacciones</p>
        </div>
        <div className="relative w-full md:w-96">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por Folio o Cliente..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-600/10 transition-all"
          />
        </div>
      </div>

      {/* Tabla de Ventas - Responsive */}
      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
        {/* Vista Desktop - Tabla */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Folio / Fecha</th>
                <th className="px-8 py-5">Cliente / Cajera</th>
                <th className="px-8 py-5">Forma de Pago</th>
                <th className="px-8 py-5">Boleta</th>
                <th className="px-8 py-5 text-right">Total</th>
                <th className="px-8 py-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="p-20 text-center animate-pulse font-bold text-gray-400 uppercase tracking-widest">Cargando Historial...</td></tr>
              ) : filteredVentas.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center font-bold text-gray-400 italic">No se encontraron ventas.</td></tr>
              ) : filteredVentas.map(v => (
                <tr key={v.id_venta} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group">
                  <td className="px-8 py-6">
                    <p className="font-black text-gray-900 dark:text-white text-sm">#{v.id_venta.slice(0, 8).toUpperCase()}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(v.fecha_venta).toLocaleString()}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-bold text-gray-900 dark:text-white text-sm">{v.cliente?.nombre || 'Venta General'}</p>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cajera: {v.usuario?.nombre || '---'}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      v.estado === 'anulada' ? 'bg-red-100 text-red-700' : v.forma_pago === 'fiado' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {v.estado === 'anulada' ? 'inactiva' : v.forma_pago}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      v.requiere_boleta && v.estado_boleta === 'emitida'
                        ? 'bg-emerald-100 text-emerald-700'
                        : v.requiere_boleta && v.estado_boleta === 'rechazada'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {v.requiere_boleta ? (v.estado_boleta || 'pendiente') : 'sin boleta'}
                    </span>
                    {v.folio_boleta && <p className="text-[10px] font-bold text-gray-400 mt-1">Folio {v.folio_boleta}</p>}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <p className={`font-black text-lg ${v.estado === 'anulada' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>${v.total_venta.toLocaleString()}</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => openDetail(v)}
                        className="bg-gray-900 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg active:scale-95"
                      >
                        Ver Detalle
                      </button>
                      {(role === 'admin' || role === 'cajera') && v.estado !== 'anulada' && (
                        <button
                          onClick={() => openInactiveModal(v)}
                          className="bg-red-50 text-red-700 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95"
                        >
                          Inactivar
                        </button>
                      )}
                      {role === 'admin' && v.estado === 'anulada' && (
                        <button
                          onClick={() => openReactivateModal(v)}
                          className="bg-emerald-50 text-emerald-700 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                        >
                          Reactivar
                        </button>
                      )}
                      {v.requiere_boleta && v.estado_boleta === 'emitida' && (
                        <>
                          <button
                            onClick={() => loadBoletaDocument(v)}
                            className="bg-blue-50 text-blue-700 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                          >
                            Ver boleta
                          </button>
                          <button
                            onClick={() => loadBoletaDocument(v, true)}
                            className="bg-gray-50 text-gray-700 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all active:scale-95"
                          >
                            Reimprimir
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Vista Mobile - Cards */}
        <div className="md:hidden p-4 space-y-4">
          {loading ? (
            <div className="p-20 text-center animate-pulse font-bold text-gray-400 uppercase tracking-widest">Cargando Historial...</div>
          ) : filteredVentas.length === 0 ? (
            <div className="p-20 text-center font-bold text-gray-400 italic">No se encontraron ventas.</div>
          ) : filteredVentas.map(v => (
            <div 
              key={v.id_venta} 
              className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 space-y-3"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-black text-gray-900 dark:text-white text-base">#{v.id_venta.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs font-bold text-gray-400 uppercase">{new Date(v.fecha_venta).toLocaleString()}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                  v.estado === 'anulada' ? 'bg-red-100 text-red-700' : v.forma_pago === 'fiado' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {v.estado === 'anulada' ? 'inactiva' : v.forma_pago}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Cliente</p>
                  <p className="font-bold text-gray-900 dark:text-white">{v.cliente?.nombre || 'Venta General'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Cajera</p>
                  <p className="font-bold text-blue-600">{v.usuario?.nombre || '---'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Boleta</p>
                  <p className={`font-black uppercase ${
                    v.requiere_boleta && v.estado_boleta === 'emitida'
                      ? 'text-emerald-600'
                      : v.requiere_boleta && v.estado_boleta === 'rechazada'
                        ? 'text-red-600'
                        : 'text-gray-400'
                  }`}>
                    {v.requiere_boleta ? (v.estado_boleta || 'pendiente') : 'sin boleta'} {v.folio_boleta ? `- Folio ${v.folio_boleta}` : ''}
                  </p>
                </div>
              </div>
              
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <p className="text-xs font-bold text-gray-400 uppercase">Total</p>
                <p className={`font-black text-lg ${v.estado === 'anulada' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>${v.total_venta.toLocaleString()}</p>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => openDetail(v)}
                  className="w-full bg-gray-900 text-white px-4 py-3 rounded-xl text-sm font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg active:scale-95"
                >
                  Ver Detalle
                </button>
                {(role === 'admin' || role === 'cajera') && v.estado !== 'anulada' && (
                  <button
                    onClick={() => openInactiveModal(v)}
                    className="w-full bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-widest active:scale-95"
                  >
                    Inactivar
                  </button>
                )}
                {role === 'admin' && v.estado === 'anulada' && (
                  <button
                    onClick={() => openReactivateModal(v)}
                    className="w-full bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-widest active:scale-95"
                  >
                    Reactivar
                  </button>
                )}
                {v.requiere_boleta && v.estado_boleta === 'emitida' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => loadBoletaDocument(v)}
                      className="w-full bg-blue-50 text-blue-700 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95"
                    >
                      Ver boleta
                    </button>
                    <button
                      onClick={() => loadBoletaDocument(v, true)}
                      className="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95"
                    >
                      Reimprimir
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de Detalle */}
      {isDetailOpen && selectedVenta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic">Detalle de Venta</h2>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Folio: #{selectedVenta.id_venta.toUpperCase()}</p>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors text-2xl">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl">
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Fecha y Hora</p>
                <p className="font-bold text-sm text-gray-900 dark:text-white">{new Date(selectedVenta.fecha_venta).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Cliente</p>
                <p className="font-bold text-sm text-gray-900 dark:text-white">{selectedVenta.cliente?.nombre || 'Venta General'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Forma de Pago</p>
                <p className="font-black text-sm text-blue-600 uppercase tracking-widest">{selectedVenta.forma_pago}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Vendedor/a</p>
                <p className="font-bold text-sm text-gray-900 dark:text-white">{selectedVenta.usuario?.nombre || '---'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto pr-2">
              <table className="w-full">
                <thead className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="py-3 text-left">Producto</th>
                    <th className="py-3 text-center">Cant.</th>
                    <th className="py-3 text-right">Unitario</th>
                    <th className="py-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {detalles.map(d => (
                    <tr key={d.id_detalle_venta}>
                      <td className="py-4 font-bold text-sm text-gray-900 dark:text-white">{d.producto?.nombre || 'Producto Variable'}</td>
                      <td className="py-4 text-center font-black text-sm">{d.cantidad}</td>
                      <td className="py-4 text-right text-gray-500 font-bold text-sm">${(d.precio_unitario_venta || 0).toLocaleString()}</td>
                      <td className="py-4 text-right font-black text-sm">${(d.subtotal || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 pt-8 border-t-4 border-double border-gray-100 dark:border-gray-700">
              <div className="space-y-2">
                {selectedVenta.estado === 'anulada' && (
                  <p className="text-xs font-black text-red-600 mb-4 uppercase tracking-widest">Venta inactiva: excluida de reportes, stock y totales.</p>
                )}
                {selectedVenta.observacion && (
                  <p className="text-xs font-bold text-emerald-600 mb-4 italic">✨ {selectedVenta.observacion}</p>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
                  <span className="font-bold text-gray-900 dark:text-white">${(selectedVenta.subtotal || 0).toLocaleString()}</span>
                </div>
                {selectedVenta.recargo > 0 && (
                  <div className="flex justify-between items-center text-blue-600">
                    <span className="text-xs font-black uppercase tracking-widest">Recargo</span>
                    <span className="font-bold">+${selectedVenta.recargo.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">IVA (19%)</span>
                  <span className="font-bold text-gray-900 dark:text-white">${(selectedVenta.total_venta * 0.19).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Total Cobrado</span>
                  <span className="text-4xl font-black text-blue-600">${selectedVenta.total_venta.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Estado boleta</span>
                  <span className={`text-xs font-black uppercase tracking-widest ${
                    selectedVenta.requiere_boleta && selectedVenta.estado_boleta === 'emitida'
                      ? 'text-emerald-600'
                      : selectedVenta.requiere_boleta && selectedVenta.estado_boleta === 'rechazada'
                        ? 'text-red-600'
                        : 'text-gray-400'
                  }`}>
                    {selectedVenta.requiere_boleta ? (selectedVenta.estado_boleta || 'pendiente') : 'sin boleta'} {selectedVenta.folio_boleta ? `- Folio ${selectedVenta.folio_boleta}` : ''}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => window.print()}
                className="w-full mt-8 py-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all"
              >
                🖨️ Imprimir Comprobante
              </button>
              {(role === 'admin' || role === 'cajera') && selectedVenta.estado !== 'anulada' && (
                <button
                  onClick={() => openInactiveModal(selectedVenta)}
                  className="w-full mt-3 py-4 bg-red-50 text-red-700 font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white transition-all"
                >
                  Inactivar venta
                </button>
              )}
              {role === 'admin' && selectedVenta.estado === 'anulada' && (
                <button
                  onClick={() => openReactivateModal(selectedVenta)}
                  className="w-full mt-3 py-4 bg-emerald-50 text-emerald-700 font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-emerald-600 hover:text-white transition-all"
                >
                  Reactivar venta
                </button>
              )}
              {selectedVenta.requiere_boleta && selectedVenta.estado_boleta === 'emitida' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button
                    onClick={() => loadBoletaDocument(selectedVenta)}
                    className="py-4 bg-blue-50 text-blue-700 font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all"
                  >
                    Ver boleta
                  </button>
                  <button
                    onClick={() => loadBoletaDocument(selectedVenta, true)}
                    className="py-4 bg-gray-100 text-gray-700 font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-gray-900 hover:text-white transition-all"
                  >
                    Reimprimir
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {boletaPreview && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-auto">
            <div className="text-center border-b border-gray-100 dark:border-gray-700 pb-5 mb-5">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Boleta electronica</p>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-1">Folio {boletaPreview.venta.folio_boleta}</h2>
              {boletaPreview.venta.track_id_sii && (
                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Track ID {boletaPreview.venta.track_id_sii}</p>
              )}
            </div>
            <div className="space-y-2">
              {boletaPreview.detalles.map((d, index) => (
                <div key={`${d.id_detalle_venta || d.id_producto || index}`} className="flex justify-between gap-3 text-sm py-2 border-b border-gray-50 dark:border-gray-700">
                  <span className="font-bold text-gray-700 dark:text-gray-200">{d.producto?.nombre || d.nombre || 'Producto'}</span>
                  <span className="font-black text-gray-900 dark:text-white whitespace-nowrap">${(d.subtotal || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-5 mt-5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total</span>
              <span className="text-3xl font-black text-blue-600">${boletaPreview.venta.total_venta.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => setBoletaPreview(null)}
                className="py-4 text-gray-400 font-black text-[10px] uppercase tracking-widest"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => printBoleta(boletaPreview)}
                className="py-4 bg-gray-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {isInactiveOpen && ventaToInactive && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">Inactivar venta</h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                Folio #{ventaToInactive.id_venta.slice(0, 8).toUpperCase()} - {new Date(ventaToInactive.fecha_venta).toLocaleString()}
              </p>
            </div>
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-500">
                La venta no se eliminará. Se revertirá su stock y dejará de contar en reportes, caja, totales y estadísticas.
              </p>
              <textarea
                value={inactiveReason}
                onChange={e => setInactiveReason(e.target.value)}
                placeholder="Justificación obligatoria..."
                className="w-full h-32 p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm resize-none focus:ring-4 focus:ring-red-600/10"
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsInactiveOpen(false)}
                  className="flex-1 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest"
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleInactivarVenta}
                  disabled={actionLoading || !inactiveReason.trim()}
                  className="flex-[2] py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
                >
                  {actionLoading ? 'Procesando...' : 'Confirmar inactivación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReactivateOpen && ventaToReactivate && role === 'admin' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">Reactivar venta</h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                Folio #{ventaToReactivate.id_venta.slice(0, 8).toUpperCase()} - {new Date(ventaToReactivate.fecha_venta).toLocaleString()}
              </p>
            </div>
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-500">
                Se volverá a aplicar el efecto de la venta en stock, reportes, caja y saldos asociados. Esta acción solo puede ejecutarla un administrador.
              </p>
              <textarea
                value={reactivateReason}
                onChange={e => setReactivateReason(e.target.value)}
                placeholder="Motivo u observación de reactivación (opcional)..."
                className="w-full h-28 p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm resize-none focus:ring-4 focus:ring-emerald-600/10"
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsReactivateOpen(false)}
                  className="flex-1 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest"
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReactivarVenta}
                  disabled={actionLoading}
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
                >
                  {actionLoading ? 'Procesando...' : 'Confirmar reactivación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
