"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/utils';
import { Database } from '@/types/database.types';

type CajaRow = Database['public']['Tables']['Caja']['Row'];
type SolicitudRow = Database['public']['Tables']['SolicitudCaja']['Row'];
type NotificacionRow = Database['public']['Tables']['NotificacionAdmin']['Row'];

interface CajaConUsuario extends CajaRow {
  usuario_apertura?: { nombre: string | null; email: string } | null;
  usuario_cierre?: { nombre: string | null; email: string } | null;
}

interface SolicitudConCajera extends SolicitudRow {
  cajera?: { nombre: string | null; email: string } | null;
}

interface VentaResumen {
  forma_pago: string;
  total_venta: number;
  saldo_favor_usado?: number;
}

export default function CajaPage() {
  const { user, role, isMounted } = useAuth();

  // States
  const [cajasAbiertas, setCajasAbiertas] = useState<CajaConUsuario[]>([]);
  const [historialCajas, setHistorialCajas] = useState<CajaConUsuario[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudConCajera[]>([]);
  const [ventasCaja, setVentasCaja] = useState<VentaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Apertura de caja
  const [isAbrirOpen, setIsAbrirOpen] = useState(false);
  const [montoInicial, setMontoInicial] = useState(0);

  // Cierre de caja
  const [isCierreOpen, setIsCierreOpen] = useState(false);
  const [cajaACerrar, setCajaACerrar] = useState<CajaConUsuario | null>(null);
  const [montoDeclarado, setMontoDeclarado] = useState(0);
  const [observacionCierre, setObservacionCierre] = useState('');

  // Solicitud segunda caja
  const [isSolicitudOpen, setIsSolicitudOpen] = useState(false);
  const [motivoSolicitud, setMotivoSolicitud] = useState('');

  // Historial
  const [showHistorial, setShowHistorial] = useState(false);

  // ─── Fetch Data ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Cajas abiertas del usuario actual (cada uno ve la suya)
      const { data: abiertas } = await (supabase as any)
        .from('Caja')
        .select('*, usuario_apertura:Usuario!Caja_id_usuario_apertura_fkey(nombre, email)')
        .eq('estado', 'abierta')
        .eq('id_usuario_apertura', user?.id)
        .order('fecha_apertura', { ascending: false });

      setCajasAbiertas(abiertas || []);

      // 2. Ventas de cajas abiertas (para resumen)
      if (abiertas && abiertas.length > 0) {
        const cajaIds = abiertas.map((c: CajaRow) => c.id);
        
        let query = (supabase as any)
          .from('Venta')
          .select('forma_pago, total_venta')
          .in('id_caja', cajaIds);

        // Control real por rol: La cajera solo descarga ventas en efectivo
        if (role !== 'admin') {
          query = query.eq('forma_pago', 'efectivo');
        }

        const { data: ventas } = await query;
        setVentasCaja(ventas || []);
      } else {
        setVentasCaja([]);
      }

      // 3. Solicitudes pendientes (para admin)
      if (role === 'admin') {
        const { data: sols } = await (supabase as any)
          .from('SolicitudCaja')
          .select('*, cajera:Usuario!SolicitudCaja_id_cajera_fkey(nombre, email)')
          .eq('estado', 'pendiente')
          .order('created_at', { ascending: false });
        setSolicitudes(sols || []);
      }

      // 4. Historial de cajas cerradas del usuario actual (últimas 20)
      const { data: historial } = await (supabase as any)
        .from('Caja')
        .select('*, usuario_apertura:Usuario!Caja_id_usuario_apertura_fkey(nombre, email), usuario_cierre:Usuario!Caja_id_usuario_cierre_fkey(nombre, email)')
        .neq('estado', 'abierta')
        .eq('id_usuario_apertura', user?.id)
        .order('fecha_cierre', { ascending: false })
        .limit(20);
      setHistorialCajas(historial || []);

    } catch (err) {
      console.error('Error cargando datos de caja:', err);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (isMounted && user) fetchData();
  }, [isMounted, user, fetchData]);

  // ─── Resumen de Ventas por Caja ────────────────────────────────────
  const getResumenCaja = useCallback((id_caja: string) => {
    const ventas = ventasCaja.filter(v => (v as any).id_caja === id_caja);
    const map: Record<string, number> = {};
    for (const v of ventas) {
      const pagadoFisico = (v.total_venta || 0) - (v.saldo_favor_usado || 0);
      map[v.forma_pago] = (map[v.forma_pago] || 0) + pagadoFisico;
    }
    const totalEfectivo = map['efectivo'] || 0;
    return { map, totalEfectivo };
  }, [ventasCaja]);

  // ─── Abrir Caja ───────────────────────────────────────────
  const handleAbrirCaja = async () => {
    if (!user) return;
    try {
      setActionLoading(true);

      // Validar que no haya ya 2 cajas abiertas
      if (cajasAbiertas.length >= 2) {
        alert('Ya hay 2 cajas abiertas. Cierra una antes de abrir otra.');
        return;
      }

      const numeroCaja = cajasAbiertas.length === 0 ? 1 : 2;

      const { error } = await (supabase as any)
        .from('Caja')
        .insert([{
          numero_caja: numeroCaja,
          id_usuario_apertura: user.id,
          monto_inicial: Math.max(0, Math.floor(montoInicial)),
          estado: 'abierta'
        }]);

      if (error) throw error;

      alert(`Caja ${numeroCaja} abierta correctamente.`);
      setIsAbrirOpen(false);
      setMontoInicial(0);
      fetchData();
    } catch (err: any) {
      alert('Error al abrir caja: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Cerrar Caja ──────────────────────────────────────────
  const handleCerrarCaja = async () => {
    if (!user || !cajaACerrar) return;
    try {
      setActionLoading(true);

      // Calcular monto esperado: monto_inicial + ventas en efectivo de esa caja
      const { data: ventasEfectivo } = await (supabase as any)
        .from('Venta')
        .select('total_venta')
        .eq('id_caja', cajaACerrar.id)
        .eq('forma_pago', 'efectivo');

      const totalEfectivoCaja = (ventasEfectivo || []).reduce(
        (acc: number, v: { total_venta: number }) => acc + (v.total_venta || 0), 0
      );

      const montoEsperado = (cajaACerrar.monto_inicial || 0) + totalEfectivoCaja;
      const declarado = Math.floor(montoDeclarado);
      const diff = declarado - montoEsperado;
      const hayDescuadre = diff !== 0;

      const updatePayload: any = {
        fecha_cierre: new Date().toISOString(),
        id_usuario_cierre: user.id,
        monto_esperado: montoEsperado,
        monto_declarado: declarado,
        diferencia: diff,
        estado: hayDescuadre ? 'cerrada_con_descuadre' : 'cerrada',
        observacion: observacionCierre || null
      };

      const { error } = await (supabase as any)
        .from('Caja')
        .update(updatePayload)
        .eq('id', cajaACerrar.id);

      if (error) throw error;

      // Si hay descuadre, notificar al admin
      if (hayDescuadre) {
        await (supabase as any)
          .from('NotificacionAdmin')
          .insert([{
            tipo: 'descuadre',
            titulo: `Descuadre en Caja ${cajaACerrar.numero_caja}`,
            mensaje: `La caja ${cajaACerrar.numero_caja} fue cerrada con una diferencia de ${formatCurrency(Math.abs(diff))} (${diff > 0 ? 'sobrante' : 'faltante'}).`,
            metadata: {
              id_caja: cajaACerrar.id,
              monto_esperado: montoEsperado,
              monto_declarado: declarado,
              diferencia: diff
            }
          }]);
      }

      alert(hayDescuadre
        ? `Caja cerrada con descuadre de ${formatCurrency(Math.abs(diff))}. Se notificó al administrador.`
        : 'Caja cerrada correctamente. ¡Los montos cuadran!'
      );

      setIsCierreOpen(false);
      setCajaACerrar(null);
      setMontoDeclarado(0);
      setObservacionCierre('');
      fetchData();
    } catch (err: any) {
      alert('Error al cerrar caja: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Solicitar Segunda Caja ───────────────────────────────
  const handleSolicitarCaja = async () => {
    if (!user) return;
    try {
      setActionLoading(true);

      const { error } = await (supabase as any)
        .from('SolicitudCaja')
        .insert([{
          id_cajera: user.id,
          motivo: motivoSolicitud
        }]);

      if (error) throw error;

      // Notificar al admin
      await (supabase as any)
        .from('NotificacionAdmin')
        .insert([{
          tipo: 'solicitud_caja',
          titulo: 'Solicitud de Segunda Caja',
          mensaje: `La cajera ${user.email} solicita abrir una segunda caja. Motivo: ${motivoSolicitud}`,
          metadata: { id_cajera: user.id, email_cajera: user.email }
        }]);

      alert('Solicitud enviada al administrador.');
      setIsSolicitudOpen(false);
      setMotivoSolicitud('');
    } catch (err: any) {
      alert('Error al enviar solicitud: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Aprobar/Rechazar Solicitud (Admin) ───────────────────
  const handleResponderSolicitud = async (solicitud: SolicitudConCajera, aprobar: boolean) => {
    if (!user) return;
    try {
      setActionLoading(true);

      if (aprobar) {
        // Crear la segunda caja
        const { data: nuevaCaja, error: cajaError } = await (supabase as any)
          .from('Caja')
          .insert([{
            numero_caja: 2,
            id_usuario_apertura: user.id,
            monto_inicial: 0,
            estado: 'abierta'
          }])
          .select()
          .single();

        if (cajaError) throw cajaError;

        // Actualizar solicitud
        const { error } = await (supabase as any)
          .from('SolicitudCaja')
          .update({
            estado: 'aprobada',
            id_admin_responde: user.id,
            id_caja_creada: nuevaCaja.id,
            responded_at: new Date().toISOString()
          })
          .eq('id', solicitud.id);

        if (error) throw error;
        alert('Solicitud aprobada. Se abrió la segunda caja.');
      } else {
        const { error } = await (supabase as any)
          .from('SolicitudCaja')
          .update({
            estado: 'rechazada',
            id_admin_responde: user.id,
            respuesta_admin: 'Rechazada por el administrador.',
            responded_at: new Date().toISOString()
          })
          .eq('id', solicitud.id);

        if (error) throw error;
        alert('Solicitud rechazada.');
      }

      fetchData();
    } catch (err: any) {
      alert('Error: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Guards ───────────────────────────────────────────────
  if (!isMounted) return null;

  if (role !== 'admin' && role !== 'cajera') {
    return (
      <div className="p-12 text-center bg-red-50 rounded-3xl border border-red-100">
        <h2 className="text-2xl font-black text-red-600 uppercase italic">Acceso No Autorizado</h2>
        <p className="text-gray-500 font-bold mt-2">No tienes permisos para gestionar cajas.</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic">Gestión de Caja</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
            {cajasAbiertas.length === 0 ? 'Sin cajas abiertas' : `${cajasAbiertas.length} caja(s) abierta(s)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {cajasAbiertas.length < 2 && (
            <button
              onClick={() => {
                if (cajasAbiertas.length === 1 && role !== 'admin') {
                  setIsSolicitudOpen(true);
                } else {
                  setIsAbrirOpen(true);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-95"
            >
              {cajasAbiertas.length === 0 ? '+ Abrir Caja del Día' : cajasAbiertas.length === 1 && role !== 'admin' ? '📩 Solicitar Segunda Caja' : '+ Abrir Segunda Caja'}
            </button>
          )}
          <button
            onClick={() => setShowHistorial(!showHistorial)}
            className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
          >
            {showHistorial ? '← Volver' : '📋 Historial'}
          </button>
        </div>
      </div>

      {/* ── Solicitudes Pendientes (Admin) ── */}
      {role === 'admin' && solicitudes.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-200 dark:border-amber-800 p-6 sm:p-8 rounded-[2rem] space-y-4">
          <h2 className="text-sm font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></span>
            Solicitudes Pendientes de Segunda Caja
          </h2>
          {solicitudes.map(s => (
            <div key={s.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-amber-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="font-bold text-gray-900 dark:text-white text-sm">{s.cajera?.nombre || s.cajera?.email || 'Cajera'}</p>
                <p className="text-xs text-gray-500 italic mt-1">"{s.motivo}"</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{new Date(s.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleResponderSolicitud(s, true)}
                  disabled={actionLoading}
                  className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  ✓ Aprobar
                </button>
                <button
                  onClick={() => handleResponderSolicitud(s, false)}
                  disabled={actionLoading}
                  className="bg-red-100 text-red-700 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-200 transition-all disabled:opacity-50"
                >
                  ✕ Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Cajas Abiertas ── */}
      {!showHistorial && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-full p-20 text-center animate-pulse font-bold text-gray-400 uppercase tracking-widest">
              Cargando cajas...
            </div>
          ) : cajasAbiertas.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-gray-800 p-12 sm:p-16 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-5xl mb-4 grayscale opacity-30">💰</p>
              <h3 className="text-xl font-black text-gray-900 dark:text-white italic mb-2">No hay cajas abiertas</h3>
              <p className="text-sm text-gray-400 font-bold">Abre una caja para comenzar a registrar ventas del día.</p>
            </div>
          ) : cajasAbiertas.map(caja => (
            <div key={caja.id} className="bg-white dark:bg-gray-800 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              {/* Caja Header */}
              <div className="p-6 sm:p-8 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span>
                    <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Caja {caja.numero_caja}</h3>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Abierta: {new Date(caja.fecha_apertura).toLocaleString()}
                  </p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                    Por: {caja.usuario_apertura?.nombre || caja.usuario_apertura?.email || '---'}
                  </p>
                </div>
                <button
                  onClick={() => { setCajaACerrar(caja); setIsCierreOpen(true); }}
                  className="bg-red-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-none active:scale-95"
                >
                  Cerrar Caja
                </button>
              </div>

              {/* Resumen de Ventas */}
              <div className="p-6 sm:p-8 space-y-4">
                {role === 'admin' && (
                  <>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumen de Ventas</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Efectivo', key: 'efectivo', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                        { label: 'Tarjeta', key: 'tarjeta', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                        { label: 'Transferencia', key: 'transferencia', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                        { label: 'Fiado', key: 'fiado', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                      ].map(m => (
                        <div key={m.key} className={`${m.bg} p-4 rounded-2xl`}>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{m.label}</p>
                          <p className={`text-lg font-black ${m.color}`}>{formatCurrency(getResumenCaja(caja.id).map[m.key] || 0)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fondo Inicial</span>
                  <span className="font-black text-gray-900 dark:text-white">{formatCurrency(caja.monto_inicial || 0)}</span>
                </div>
                <div className="p-4 bg-gray-900 dark:bg-white/10 rounded-2xl flex justify-between items-center">
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Total Efectivo Esperado en Caja</span>
                  <span className="font-black text-emerald-400 text-xl">{formatCurrency((caja.monto_inicial || 0) + getResumenCaja(caja.id).totalEfectivo)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Historial ── */}
      {showHistorial && (
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="p-6 sm:p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
            <h2 className="font-black text-gray-900 dark:text-white uppercase text-sm tracking-widest">Historial de Cajas Cerradas</h2>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                <tr>
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">Apertura</th>
                  <th className="px-6 py-4">Cierre</th>
                  <th className="px-6 py-4 text-right">Esperado</th>
                  <th className="px-6 py-4 text-right">Declarado</th>
                  <th className="px-6 py-4 text-right">Diferencia</th>
                  <th className="px-6 py-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {historialCajas.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center font-bold text-gray-400 italic">No hay cajas cerradas aún.</td></tr>
                ) : historialCajas.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-5 font-black text-gray-900 dark:text-white">Caja {c.numero_caja}</td>
                    <td className="px-6 py-5 text-sm text-gray-500 font-bold">{new Date(c.fecha_apertura).toLocaleString()}</td>
                    <td className="px-6 py-5 text-sm text-gray-500 font-bold">{c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleString() : '---'}</td>
                    <td className="px-6 py-5 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(c.monto_esperado || 0)}</td>
                    <td className="px-6 py-5 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(c.monto_declarado || 0)}</td>
                    <td className={`px-6 py-5 text-right font-black ${(c.diferencia || 0) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {(c.diferencia || 0) > 0 ? '+' : ''}{formatCurrency(c.diferencia || 0)}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        c.estado === 'cerrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {c.estado === 'cerrada' ? 'OK' : 'DESCUADRE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-4">
            {historialCajas.length === 0 ? (
              <div className="p-12 text-center font-bold text-gray-400 italic">No hay cajas cerradas aún.</div>
            ) : historialCajas.map(c => (
              <div key={c.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-black text-gray-900 dark:text-white">Caja {c.numero_caja}</span>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                    c.estado === 'cerrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {c.estado === 'cerrada' ? 'OK' : 'DESCUADRE'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase">Esperado</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(c.monto_esperado || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase">Declarado</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(c.monto_declarado || 0)}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-[9px] font-black text-gray-400 uppercase">Diferencia</span>
                  <span className={`font-black ${(c.diferencia || 0) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(c.diferencia || 0) > 0 ? '+' : ''}{formatCurrency(c.diferencia || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal: Abrir Caja ── */}
      {isAbrirOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter italic">Abrir Caja</h2>
              <button onClick={() => setIsAbrirOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl">✕</button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Monto Inicial (Fondo de Caja)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={montoInicial}
                  onChange={e => {
                    e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                    setMontoInicial(Math.max(0, Math.floor(Number(e.target.value) || 0)));
                  }}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-2xl text-blue-600"
                />
                <p className="text-[10px] font-bold text-gray-400 mt-2 italic">Efectivo disponible al abrir caja (sencillo, vueltos).</p>
              </div>

              <button
                onClick={handleAbrirCaja}
                disabled={actionLoading}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none disabled:opacity-50 active:scale-95"
              >
                {actionLoading ? 'Abriendo...' : 'Confirmar Apertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Cerrar Caja ── */}
      {isCierreOpen && cajaACerrar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[2.5rem] p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter italic">Cerrar Caja {cajaACerrar.numero_caja}</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                  Abierta desde: {new Date(cajaACerrar.fecha_apertura).toLocaleString()}
                </p>
              </div>
              <button onClick={() => { setIsCierreOpen(false); setCajaACerrar(null); }} className="text-gray-400 hover:text-red-500 text-2xl">✕</button>
            </div>

            <div className="space-y-6">
              {/* Resumen automático */}
              <div className="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-2xl space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Resumen Automático</p>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-500">Fondo Inicial</span>
                  <span className="font-black text-gray-900 dark:text-white">{formatCurrency(cajaACerrar.monto_inicial || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-500">Ventas Efectivo</span>
                  <span className="font-black text-emerald-600">{formatCurrency(getResumenCaja(cajaACerrar.id).totalEfectivo)}</span>
                </div>
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between">
                  <span className="font-black text-gray-900 dark:text-white uppercase text-xs">Monto Esperado en Caja</span>
                  <span className="font-black text-emerald-600 text-lg">{formatCurrency((cajaACerrar.monto_inicial || 0) + getResumenCaja(cajaACerrar.id).totalEfectivo)}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Monto Declarado (Conteo Físico)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={montoDeclarado}
                  onChange={e => {
                    e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                    setMontoDeclarado(Math.max(0, Math.floor(Number(e.target.value) || 0)));
                  }}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-2xl text-blue-600"
                />
                <p className="text-[10px] font-bold text-gray-400 mt-2 italic">Cuenta el efectivo físico y escribe el total.</p>
              </div>

              {/* Diferencia preview */}
              {montoDeclarado > 0 && (
                <div className={`p-4 rounded-2xl ${
                  montoDeclarado === (cajaACerrar.monto_inicial || 0) + getResumenCaja(cajaACerrar.id).totalEfectivo
                    ? 'bg-emerald-50 border-2 border-emerald-200'
                    : 'bg-red-50 border-2 border-red-200'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase">Diferencia</span>
                    <span className={`text-lg font-black ${
                      montoDeclarado === (cajaACerrar.monto_inicial || 0) + getResumenCaja(cajaACerrar.id).totalEfectivo ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(montoDeclarado - ((cajaACerrar.monto_inicial || 0) + getResumenCaja(cajaACerrar.id).totalEfectivo))}
                    </span>
                  </div>
                  {montoDeclarado === (cajaACerrar.monto_inicial || 0) + getResumenCaja(cajaACerrar.id).totalEfectivo
                    ? <p className="text-xs font-bold text-emerald-600 mt-1">✓ Los montos cuadran perfectamente</p>
                    : <p className="text-xs font-bold text-red-600 mt-1">⚠️ Hay un descuadre. Se notificará al administrador.</p>
                  }
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Observaciones (Opcional)</label>
                <textarea
                  value={observacionCierre}
                  onChange={e => setObservacionCierre(e.target.value)}
                  placeholder="Notas sobre el cierre..."
                  className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm resize-none h-20"
                />
              </div>

              <button
                onClick={handleCerrarCaja}
                disabled={actionLoading || montoDeclarado <= 0}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-none disabled:opacity-50 active:scale-95"
              >
                {actionLoading ? 'Cerrando...' : 'Confirmar Cierre de Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Solicitar Segunda Caja ── */}
      {isSolicitudOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter italic">Solicitar Segunda Caja</h2>
              <button onClick={() => setIsSolicitudOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl">✕</button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Motivo de la Solicitud</label>
                <textarea
                  value={motivoSolicitud}
                  onChange={e => setMotivoSolicitud(e.target.value)}
                  placeholder="Explica por qué necesitas una segunda caja..."
                  className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-sm resize-none h-28"
                />
              </div>
              <p className="text-[10px] font-bold text-gray-400 italic">Tu solicitud será enviada al administrador para su aprobación.</p>

              <button
                onClick={handleSolicitarCaja}
                disabled={actionLoading || !motivoSolicitud.trim()}
                className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg disabled:opacity-50 active:scale-95"
              >
                {actionLoading ? 'Enviando...' : 'Enviar Solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
