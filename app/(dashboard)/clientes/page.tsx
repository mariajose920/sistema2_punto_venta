"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, normalizeRUT, formatCurrency, normalizeAmount, formatRUTVisual } from '@/lib/utils';
import { saveCliente } from '@/lib/services/clientes';
import { Database } from '@/types/database.types';

type ClienteRow = Database['public']['Tables']['Cliente']['Row'];
type VentaRow = Database['public']['Tables']['Venta']['Row'];
type PagoRow = Database['public']['Tables']['Pago']['Row'];
type CreditoRow = Database['public']['Tables']['Credito']['Row'];

interface Movimiento {
  id: string;
  tipo: 'venta' | 'pago';
  monto: number;
  fecha: string;
  referencia: string;
}

interface DetalleVentaConProducto {
  cantidad: number;
  precio_unitario_venta: number;
  subtotal: number;
  Producto: { nombre: string } | null;
}

interface VentaConDetalles extends VentaRow {
  DetalleVenta: DetalleVentaConProducto[];
}

export default function ClientesPage() {
  const { role } = useAuth();
  const canManageClientes = role === 'admin' || role === 'cajera';

  // Estados de datos
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isAbonoOpen, setIsAbonoOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [selectedCliente, setSelectedCliente] = useState<ClienteRow | null>(null);
  const [historial, setHistorial] = useState<Movimiento[]>([]);

  // Tabs de Historial
  const [activeTab, setActiveTab] = useState<'movimientos' | 'compras'>('movimientos');
  const [historialCompras, setHistorialCompras] = useState<VentaConDetalles[]>([]);

  // Formulario Abono
  const [montoAbono, setMontoAbono] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // Formulario Cliente
  const [formData, setFormData] = useState<Partial<ClienteRow>>({
    nombre: '',
    telefono: '',
    rut: ''
  });

  // Utilidades de RUT delegadas a lib/utils.ts y lib/services/clientes.ts

  // ============================================================================
  // REGLA INVARIANTE: nunca saldo_deudado > 0 y saldo_favor > 0 al mismo tiempo.
  // Si ambos son positivos, el saldo a favor descuenta la deuda primero.
  // Ejemplo: deuda=3800, favor=500  => deuda=3300, favor=0
  //          deuda=300,  favor=1400 => deuda=0,    favor=1100
  // ============================================================================
  const compensarSaldo = (deuda: number, favor: number): { deuda: number; favor: number } => {
    const d = Math.max(0, normalizeAmount(deuda || 0));
    const f = Math.max(0, normalizeAmount(favor || 0));
    if (d > 0 && f > 0) {
      if (f >= d) return { deuda: 0, favor: f - d };
      return { deuda: d - f, favor: 0 };
    }
    return { deuda: d, favor: f };
  };

  // 1. Cargar clientes
  // Al recibir los datos de la BD se aplica compensarSaldo en memoria,
  // garantizando que la lista siempre muestre saldos ya normalizados
  // aunque la BD tenga valores inconsistentes cargados por otros flujos.
  const fetchClientes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase.from('Cliente') as any)
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;

      // Normalizar saldos en memoria antes de mostrar
      const normalized = (data || []).map((c: ClienteRow) => {
        const { deuda, favor } = compensarSaldo(c.saldo_deudado, c.saldo_favor);
        return { ...c, saldo_deudado: deuda, saldo_favor: favor };
      });
      setClientes(normalized);
    } catch (err: unknown) {
      console.error('Error cargando clientes:', err);
      const message = err instanceof Error ? err.message : 'Error desconocido';
      alert(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  // Búsqueda Flexible
  const filtered = useMemo(() => {
    const term = normalizeText(search);
    const termRUT = normalizeRUT(search);

    return clientes.filter(c => {
      const nombreNorm = normalizeText(c.nombre);
      const rutNorm = normalizeRUT(c.rut);
      return nombreNorm.includes(term) || (rutNorm && rutNorm.includes(termRUT));
    });
  }, [search, clientes]);

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      const finalData = {
        nombre: formData.nombre || '',
        rut: formData.rut || '',
        telefono: formData.telefono || ''
      };

      await saveCliente(finalData, selectedCliente?.id);

      setIsModalOpen(false);
      fetchClientes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCliente = async (cliente: ClienteRow) => {
    const confirmacion = window.confirm(
      `¿Seguro que quieres eliminar al cliente "${cliente.nombre}"?\n\nEsta acción no se puede deshacer.`
    );

    if (!confirmacion) return;

    try {
      setLoading(true);
      const { error } = await (supabase.from('Cliente') as any)
        .delete()
        .eq('id', cliente.id);

      if (error) throw error;

      if (selectedCliente?.id === cliente.id) {
        setSelectedCliente(null);
        setIsStatementOpen(false);
        setIsAbonoOpen(false);
      }

      await fetchClientes();
      alert('Cliente eliminado correctamente.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar cliente';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const openStatement = async (cliente: ClienteRow) => {
    // Normalizar saldos antes de mostrar en el historial
    const { deuda, favor } = compensarSaldo(cliente.saldo_deudado, cliente.saldo_favor);
    const clienteNorm = { ...cliente, saldo_deudado: deuda, saldo_favor: favor };
    setSelectedCliente(clienteNorm);
    setIsStatementOpen(true);
    setActiveTab('movimientos');

    try {
      const [ventasRes, pagosRes, comprasRes] = await Promise.all([
        (supabase.from('Venta') as any).select('*').eq('id_cliente', cliente.id).eq('forma_pago', 'fiado'),
        (supabase.from('Pago') as any).select('*').eq('cliente_id', cliente.id),
        (supabase.from('Venta') as any)
          .select(`
            *,
            DetalleVenta:DetalleVenta!detalleventa_id_venta_fkey (
              cantidad,
              precio_unitario_venta,
              subtotal,
              Producto:Producto!detalleventa_id_producto_fkey (
                nombre
              )
            )
          `)
          .eq('id_cliente', cliente.id)
          .order('fecha_venta', { ascending: false })
      ]);

      const ventas = (ventasRes.data as VentaRow[]) || [];
      const pagos = (pagosRes.data as PagoRow[]) || [];
      setHistorialCompras(comprasRes.data || []);

      const movs: Movimiento[] = [
        ...ventas.map(v => ({
          id: v.id_venta,
          tipo: 'venta' as const,
          monto: v.total_venta || 0,
          fecha: v.fecha_venta || new Date().toISOString(),
          referencia: `Venta #${(v.id_venta || '').slice(0, 8)}`
        })),
        ...pagos.map(p => ({
          id: p.id,
          tipo: 'pago' as const,
          monto: p.monto || 0,
          fecha: p.created_at || new Date().toISOString(),
          referencia: `Abono (${p.metodo_pago || 'efectivo'})`
        }))
      ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      setHistorial(movs);
    } catch (err: unknown) {
      console.error('Error cargando historial:', err);
    }
  };

  // ============================================================================
  // LOGICA DE ABONO con compensación obligatoria en ambos extremos
  // ============================================================================
  const handleGeneralAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente || montoAbono <= 0) return;

    try {
      setLoading(true);

      const { data: freshCliente, error: fError } = await (supabase.from('Cliente') as any)
        .select('saldo_deudado, saldo_favor')
        .eq('id', selectedCliente.id)
        .single();

      console.log('Paso 0: Datos frescos del cliente:', { freshCliente, fError });

      if (fError || !freshCliente) throw new Error('No se pudo obtener el saldo actual del cliente');

      // PASO 0-B: Compensar saldos preexistentes antes de aplicar el abono.
      // Garantiza que si la BD tenía deuda+favor simultáneos (inconsistencia
      // generada por otro flujo), se resuelve primero antes de calcular el impacto.
      const compensado = compensarSaldo(
        Number(freshCliente.saldo_deudado || 0),
        Number(freshCliente.saldo_favor   || 0)
      );
      let nuevaDeuda      = normalizeAmount(compensado.deuda);
      let nuevoSaldoFavor = normalizeAmount(compensado.favor);

      console.log('Paso 0-B: Saldos compensados antes del abono:', { nuevaDeuda, nuevoSaldoFavor });

      // 1. Registrar el Pago
      const montoAbonoNorm = normalizeAmount(montoAbono);
      const { error: pError } = await (supabase.from('Pago') as any).insert([{
        cliente_id: selectedCliente.id,
        monto: montoAbonoNorm,
        metodo_pago: metodoPago
      }]);

      console.log('Paso 1: Registro de Pago:', { pError });
      if (pError) throw pError;

      // 2. Aplicar el monto del abono: primero paga deuda, el resto va a favor
      let restante = montoAbonoNorm;

      if (nuevaDeuda > 0) {
        if (restante >= nuevaDeuda) {
          restante -= nuevaDeuda;
          nuevaDeuda = 0;
        } else {
          nuevaDeuda -= restante;
          restante = 0;
        }
      }

      if (restante > 0) {
        nuevoSaldoFavor += restante;
      }

      // 2-B: Compensación final por seguridad (garantía de invariante)
      const final = compensarSaldo(nuevaDeuda, nuevoSaldoFavor);
      nuevaDeuda      = normalizeAmount(final.deuda);
      nuevoSaldoFavor = normalizeAmount(final.favor);

      // 3. Actualizar Cliente
      const { error: cError } = await (supabase.from('Cliente') as any)
        .update({
          saldo_deudado: normalizeAmount(nuevaDeuda),
          saldo_favor:   normalizeAmount(nuevoSaldoFavor)
        })
        .eq('id', selectedCliente.id);

      console.log('Paso 3: Actualización Cliente:', { cError, nuevaDeuda, nuevoSaldoFavor });
      if (cError) throw cError;

      // 4. Saldar créditos individuales
      const { data: creditos } = await (supabase.from('Credito') as any)
        .select('*')
        .eq('cliente_id', selectedCliente.id)
        .eq('estado', 'vigente')
        .order('created_at', { ascending: true });

      if (creditos && (creditos as CreditoRow[]).length > 0) {
        let montoParaCreditos = montoAbonoNorm;
        for (const cred of (creditos as CreditoRow[])) {
          if (montoParaCreditos <= 0) break;
          const aPagar = Math.min(normalizeAmount(cred.saldo_pendiente), montoParaCreditos);
          const nuevoSaldoCred = normalizeAmount(cred.saldo_pendiente - aPagar);
          await (supabase.from('Credito') as any)
            .update({
              saldo_pendiente: nuevoSaldoCred,
              estado: nuevoSaldoCred <= 0 ? 'pagado' : 'vigente'
            })
            .eq('id', cred.id);
          montoParaCreditos -= aPagar;
        }
      }

      alert('Abono registrado con éxito.');
      setIsAbonoOpen(false);
      setMontoAbono(0);
      fetchClientes();

      if (isStatementOpen) {
        openStatement({ ...selectedCliente, saldo_deudado: nuevaDeuda, saldo_favor: nuevoSaldoFavor });
      }
    } catch (err: any) {
      console.error('ERROR DETALLADO EN ABONO:', err);
      const message = err?.message || err?.details || JSON.stringify(err);
      alert('⚠️ Error al registrar abono:\n\n' + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header Premium */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Cuentas por Cobrar</h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 italic opacity-60">Gestión de Billeteras y Fiados</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl flex gap-1 shrink-0 self-start">
            <button onClick={() => setViewMode('grid')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Cards</button>
            <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'table' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Lista</button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre o RUT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-600/10 transition-all"
            />
          </div>
          {canManageClientes && (
            <button
              onClick={() => { setSelectedCliente(null); setFormData({ nombre: '', telefono: '', rut: '' }); setIsModalOpen(true); }}
              className="w-full sm:w-auto bg-gray-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all text-center"
            >
              Nuevo Cliente
            </button>
          )}
        </div>
      </div>

      {loading && clientes.length === 0 ? (
        <div className="py-20 text-center animate-pulse text-gray-400 font-bold uppercase tracking-widest text-xs">Sincronizando con Servidor...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-gray-800 rounded-[3rem] border-4 border-dashed border-gray-100 dark:border-gray-700">
          <p className="text-6xl mb-4 grayscale opacity-20">👤</p>
          <p className="text-gray-300 font-black uppercase tracking-widest">Sin coincidencias para &quot;{search}&quot;</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {filtered.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-800 p-5 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm group hover:shadow-2xl hover:-translate-y-2 transition-all">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase italic truncate max-w-[200px]">{c.nombre}</h3>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{c.rut || 'RUT NO REGISTRADO'}</p>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shadow-2xl text-xl ${c.saldo_deudado > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}>
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-[2rem]">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Deuda</p>
                  <p className={`text-xl font-black tracking-tighter ${c.saldo_deudado > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                    {formatCurrency(c.saldo_deudado)}
                  </p>
                </div>
                <div className={`p-6 rounded-[2rem] border-2 transition-colors ${c.saldo_favor > 0 ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30' : 'bg-gray-50 border-transparent dark:bg-gray-900'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${c.saldo_favor > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>Monto a favor</p>
                  <p className={`text-xl font-black tracking-tighter ${c.saldo_favor > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {formatCurrency(c.saldo_favor)}
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-gray-50 dark:border-gray-800 flex flex-wrap gap-2">
                <button
                  onClick={() => openStatement(c)}
                  className="flex-1 min-w-0 py-4 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-wider whitespace-nowrap hover:bg-gray-900 hover:text-white transition-all"
                >
                  Historial
                </button>
                <button
                  onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }}
                  className="flex-1 min-w-0 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider whitespace-nowrap hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20"
                >
                  Abonar
                </button>
                {canManageClientes && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }} className="p-4 bg-gray-50 dark:bg-gray-900 text-gray-300 hover:text-blue-600 rounded-2xl transition-all">✏️</button>
                    <button onClick={() => handleDeleteCliente(c)} className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl transition-all hover:scale-105">🗑️</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
          {/* Vista Desktop - Tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                <tr>
                  <th className="px-10 py-6">Ficha Cliente</th>
                  <th className="px-10 py-6">RUT</th>
                  <th className="px-10 py-6 text-right">Deuda</th>
                  <th className="px-10 py-6 text-right">Monto a favor</th>
                  <th className="px-10 py-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-10 py-6 font-black text-gray-900 dark:text-white uppercase italic">{c.nombre}</td>
                    <td className="px-10 py-6 text-xs font-mono text-gray-400">{c.rut || '---'}</td>
                    <td className={`px-10 py-6 text-right font-black ${c.saldo_deudado > 0 ? 'text-red-600' : 'text-gray-300'}`}>{formatCurrency(c.saldo_deudado)}</td>
                    <td className={`px-10 py-6 text-right font-black ${c.saldo_favor > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{formatCurrency(c.saldo_favor)}</td>
                    <td className="px-10 py-6">
                      <div className="flex justify-center gap-6">
                        <button onClick={() => openStatement(c)} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Movimientos</button>
                        <button onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline">Abonar</button>
                        {canManageClientes && (
                          <>
                            <button onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }} className="text-gray-300 hover:text-blue-600">✏️</button>
                            <button onClick={() => handleDeleteCliente(c)} className="text-red-600 hover:text-red-700">🗑️</button>
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
            {filtered.map(c => (
              <div 
                key={c.id} 
                className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 space-y-3"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-black text-gray-900 dark:text-white text-base uppercase italic">{c.nombre}</p>
                    <p className="text-xs font-mono text-gray-400">{c.rut || '---'}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-white text-sm ${c.saldo_deudado > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}>
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg text-center ${c.saldo_deudado > 0 ? 'bg-red-100 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <p className="text-xs font-bold text-gray-500 uppercase">Deuda</p>
                    <p className={`text-sm font-black ${c.saldo_deudado > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                      {formatCurrency(c.saldo_deudado)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${c.saldo_favor > 0 ? 'bg-emerald-100 dark:bg-emerald-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <p className={`text-xs font-bold uppercase ${c.saldo_favor > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>Favor</p>
                    <p className={`text-sm font-black ${c.saldo_favor > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                      {formatCurrency(c.saldo_favor)}
                    </p>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                  <button
                    onClick={() => openStatement(c)}
                    className="flex-1 min-w-0 py-2 bg-gray-900 text-white text-[10px] font-black rounded-lg uppercase tracking-wider whitespace-nowrap"
                  >
                    Historial
                  </button>
                  <button
                    onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }}
                    className="flex-1 min-w-0 py-2 bg-emerald-600 text-white text-[10px] font-black rounded-lg uppercase tracking-wider whitespace-nowrap"
                  >
                    Abonar
                  </button>
                  {canManageClientes && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }}
                        className="py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-blue-600 text-lg rounded-lg"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteCliente(c)}
                        className="py-2 px-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-lg rounded-lg"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Abono */}
      {isAbonoOpen && selectedCliente && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2rem] sm:rounded-[3rem] p-6 sm:p-12 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2 italic">Registrar Pago</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 sm:mb-10">{selectedCliente.nombre}</p>
            <form onSubmit={handleGeneralAbono} className="space-y-6 sm:space-y-8">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 px-2">Monto del Abono</label>
                <input
                  type="number"
                  required
                  autoFocus
                  value={montoAbono || ''}
                  onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setMontoAbono(Number(e.target.value)) }}
                  className="w-full p-5 sm:p-6 bg-gray-50 dark:bg-gray-900 rounded-[2rem] border-none font-black text-3xl sm:text-4xl text-emerald-600 text-center"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 px-2">Método de Recepción</label>
                <div className="grid grid-cols-3 gap-2">
                  {['efectivo', 'transferencia', 'tarjeta'].map(m => (
                    <button key={m} type="button" onClick={() => setMetodoPago(m)} className={`py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest border-2 transition-all min-h-[44px] ${metodoPago === m ? 'border-blue-600 bg-blue-600 text-white shadow-xl' : 'border-transparent bg-gray-50 text-gray-400'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsAbonoOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px] min-h-[44px]">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:bg-black transition-all uppercase tracking-widest text-xs min-h-[44px]">Confirmar Abono</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Estado de Cuenta */}
      {isStatementOpen && selectedCliente && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-t-[2rem] sm:rounded-[3.5rem] p-4 sm:p-12 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95">
            <div className="flex justify-between items-start mb-6 sm:mb-8">
              <div className="min-w-0 flex-1 mr-4">
                <h2 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic">Historial de Cuenta</h2>
                <p className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em] mt-1 truncate">{selectedCliente.nombre} • RUT {selectedCliente.rut}</p>
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="w-10 h-10 sm:w-14 sm:h-14 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-2xl sm:text-3xl hover:rotate-90 transition-transform shrink-0">✕</button>
            </div>

            {/* Selector de Pestañas */}
            <div className="flex gap-4 border-b border-gray-100 dark:border-gray-800 mb-6 sm:mb-8 shrink-0 overflow-x-auto custom-scrollbar pb-1">
              <button 
                onClick={() => setActiveTab('movimientos')}
                className={`pb-3 font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${activeTab === 'movimientos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                Movimientos Financieros
              </button>
              <button 
                onClick={() => setActiveTab('compras')}
                className={`pb-3 font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${activeTab === 'compras' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                Historial de Compras (Detallado)
              </button>
            </div>

            {activeTab === 'movimientos' ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-8 mb-6 sm:mb-8 shrink-0">
                  <div className="p-4 sm:p-6 bg-red-50 dark:bg-red-900/10 rounded-[1.5rem] sm:rounded-[2rem] border-2 border-red-100 dark:border-red-900/30 text-center">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1 sm:mb-2">Deuda Pendiente</p>
                    <p className="text-2xl sm:text-3xl font-black text-red-600 tracking-tighter">{formatCurrency(selectedCliente.saldo_deudado)}</p>
                  </div>
                  <div className="p-4 sm:p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-[1.5rem] sm:rounded-[2rem] border-2 border-emerald-100 dark:border-emerald-900/30 text-center">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1 sm:mb-2">Monto a favor</p>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tighter">{formatCurrency(selectedCliente.saldo_favor)}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-auto space-y-3 sm:space-y-4 pr-2 sm:pr-4 custom-scrollbar">
                  {historial.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                      Sin movimientos financieros
                    </div>
                  ) : (
                    historial.map((mov, idx) => (
                      <div key={mov.id + idx} className="p-5 sm:p-6 bg-gray-50/50 dark:bg-gray-900/50 rounded-[2rem] flex justify-between items-center border border-transparent hover:border-blue-500/30 transition-all">
                        <div className="flex items-center gap-4 sm:gap-6">
                          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-xl sm:text-2xl shadow-sm ${mov.tipo === 'venta' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {mov.tipo === 'venta' ? '📉' : '📈'}
                          </div>
                          <div>
                            <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{new Date(mov.fecha).toLocaleDateString()} • {new Date(mov.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            <p className="font-black text-gray-900 dark:text-white text-base sm:text-lg italic">{mov.referencia.toUpperCase()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl sm:text-2xl font-black tracking-tighter ${mov.tipo === 'venta' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {mov.tipo === 'venta' ? '-' : '+'}{formatCurrency(mov.monto)}
                          </p>
                          <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest">Movimiento Confirmado</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-auto space-y-4 pr-2 sm:pr-4 custom-scrollbar">
                {historialCompras.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                    No hay compras registradas para este cliente
                  </div>
                ) : (
                  historialCompras.map((compra) => (
                    <div key={compra.id_venta} className="p-5 sm:p-6 bg-gray-50/50 dark:bg-gray-900/50 rounded-[2rem] border border-gray-100 dark:border-gray-800 transition-all hover:border-blue-500/30">
                      <div className="flex justify-between items-start mb-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                        <div>
                          <p className="font-black text-gray-900 dark:text-white text-base sm:text-lg">Venta #{(compra.id_venta || '').slice(0, 8).toUpperCase()}</p>
                          <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{new Date(compra.fecha_venta || '').toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl sm:text-2xl font-black text-blue-600 tracking-tighter">{formatCurrency(compra.total_venta || 0)}</p>
                          <p className="text-[8px] sm:text-[9px] font-black text-gray-500 uppercase tracking-widest mt-1">
                            Pago: {compra.forma_pago}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 mt-2">
                        {compra.DetalleVenta?.map((d, i) => (
                          <div key={i} className="flex justify-between text-xs sm:text-sm items-center bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-[1rem] border border-gray-100 dark:border-gray-700">
                            <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-3">
                              <span className="bg-gray-100 dark:bg-gray-700 text-[10px] font-black text-gray-500 px-2 py-1 rounded-lg shrink-0 w-8 text-center">{d.cantidad}x</span>
                              <span className="truncate max-w-[150px] sm:max-w-xs block">{d.Producto?.nombre || 'Producto eliminado'}</span>
                            </span>
                            <span className="font-black text-gray-900 dark:text-white shrink-0">{formatCurrency(d.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Ficha Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-t-[2rem] sm:rounded-[3.5rem] p-6 sm:p-12 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95">
            <h2 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter">
              {selectedCliente ? 'Editar Ficha' : 'Nueva Ficha'}
            </h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6 sm:mb-10">Información del Cliente</p>
            <form onSubmit={handleSaveCliente} className="space-y-4 sm:space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">RUT de Identidad</label>
                <input
                  required
                  autoFocus
                  placeholder="12.345.678-9"
                  value={formData.rut || ''}
                  onBlur={e => setFormData({ ...formData, rut: formatRUTVisual(e.target.value) })}
                  onChange={e => setFormData({ ...formData, rut: e.target.value })}
                  className="w-full p-4 sm:p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-xl sm:text-2xl text-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Nombre o Razón Social</label>
                <input required value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full p-4 sm:p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg sm:text-xl uppercase italic" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Teléfono Movil</label>
                <input value={formData.telefono || ''} onChange={e => setFormData({ ...formData, telefono: e.target.value.replace(/\D/g, '').slice(0, 9) })} className="w-full p-4 sm:p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg sm:text-xl" placeholder="+56 9..." />
              </div>
              <div className="flex gap-4 pt-6 sm:pt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase tracking-widest text-[10px] min-h-[44px]">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-4 sm:py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-xs min-h-[44px]">
                  {selectedCliente ? 'Actualizar Datos' : 'Registrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
