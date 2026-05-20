"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, normalizeRUT, formatCurrency } from '@/lib/utils';
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

  // Formulario Abono
  const [montoAbono, setMontoAbono] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // Formulario Cliente
  const [formData, setFormData] = useState<Partial<ClienteRow>>({
    nombre: '',
    telefono: '',
    rut: ''
  });

  // Utilidades de RUT
  const cleanRUTInternal = (rut: string) => (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

  const validateRUT = (rut: string) => {
    const clean = cleanRUTInternal(rut);
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
    const clean = cleanRUTInternal(rut);
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

  // ============================================================================
  // REGLA INVARIANTE: nunca saldo_deudado > 0 y saldo_favor > 0 al mismo tiempo.
  // Si ambos son positivos, el saldo a favor descuenta la deuda primero.
  // Ejemplo: deuda=3800, favor=500  => deuda=3300, favor=0
  //          deuda=300,  favor=1400 => deuda=0,    favor=1100
  // ============================================================================
  const compensarSaldo = (deuda: number, favor: number): { deuda: number; favor: number } => {
    const d = Math.max(0, Number(deuda || 0));
    const f = Math.max(0, Number(favor || 0));
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
      const nombreNorm = normalizeText(formData.nombre);
      if (!nombreNorm) throw new Error('El nombre es obligatorio');

      if (!formData.rut) throw new Error('El RUT es obligatorio');
      const rutNormalizado = formatRUTVisual(formData.rut);
      if (!validateRUT(rutNormalizado)) throw new Error('El RUT ingresado no es válido');

      setLoading(true);

      // Validar duplicado de NOMBRE
      const { data: nombreExistente } = await (supabase.from('Cliente') as any)
        .select('id')
        .eq('nombre', nombreNorm)
        .neq('id', selectedCliente?.id || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (nombreExistente) {
        throw new Error(`Ya existe un cliente con el nombre: "${nombreNorm}"`);
      }

      // Validar duplicado de RUT
      const { data: existente } = await (supabase.from('Cliente') as any)
        .select('id, nombre')
        .eq('rut', rutNormalizado)
        .neq('id', selectedCliente?.id || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();
      if (existente) {
        throw new Error(`Ya existe un cliente registrado con el RUT: ${rutNormalizado} (${(existente as any).nombre})`);
      }

      const finalData = {
        nombre: nombreNorm,
        rut: rutNormalizado,
        telefono: formData.telefono || ''
      };

      if (selectedCliente?.id) {
        const { error } = await (supabase.from('Cliente') as any)
          .update(finalData)
          .eq('id', selectedCliente.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('Cliente') as any)
          .insert([{
            ...finalData,
            saldo_deudado: 0,
            saldo_favor: 0
          }]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchClientes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
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

    try {
      const [ventasRes, pagosRes] = await Promise.all([
        (supabase.from('Venta') as any).select('*').eq('id_cliente', cliente.id).eq('forma_pago', 'fiado'),
        (supabase.from('Pago') as any).select('*').eq('cliente_id', cliente.id)
      ]);

      const ventas = (ventasRes.data as VentaRow[]) || [];
      const pagos = (pagosRes.data as PagoRow[]) || [];

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
      let nuevaDeuda      = compensado.deuda;
      let nuevoSaldoFavor = compensado.favor;

      console.log('Paso 0-B: Saldos compensados antes del abono:', { nuevaDeuda, nuevoSaldoFavor });

      // 1. Registrar el Pago
      const { error: pError } = await (supabase.from('Pago') as any).insert([{
        cliente_id: selectedCliente.id,
        monto: Number(montoAbono),
        metodo_pago: metodoPago
      }]);

      console.log('Paso 1: Registro de Pago:', { pError });
      if (pError) throw pError;

      // 2. Aplicar el monto del abono: primero paga deuda, el resto va a favor
      let restante = Number(montoAbono);

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
      nuevaDeuda      = final.deuda;
      nuevoSaldoFavor = final.favor;

      // 3. Actualizar Cliente
      const { error: cError } = await (supabase.from('Cliente') as any)
        .update({
          saldo_deudado: nuevaDeuda,
          saldo_favor:   nuevoSaldoFavor
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
        let montoParaCreditos = montoAbono;
        for (const cred of (creditos as CreditoRow[])) {
          if (montoParaCreditos <= 0) break;
          const aPagar = Math.min(cred.saldo_pendiente, montoParaCreditos);
          const nuevoSaldoCred = cred.saldo_pendiente - aPagar;
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
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Cuentas por Cobrar</h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 italic opacity-60">Gestión de Billeteras y Fiados</p>
        </div>

        <div className="flex w-full md:w-auto gap-4 items-center">
          <div className="bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl flex gap-1 h-fit">
            <button onClick={() => setViewMode('grid')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Cards</button>
            <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'table' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Lista</button>
          </div>

          <div className="relative flex-1 md:w-80">
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
              className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all"
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

              <div className="mt-8 pt-8 border-t border-gray-50 dark:border-gray-800 flex gap-3">
                <button onClick={() => openStatement(c)} className="flex-1 py-4 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all">Historial</button>
                <button onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20">Abonar</button>
                {canManageClientes && (
                  <button onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }} className="p-4 bg-gray-50 dark:bg-gray-900 text-gray-300 hover:text-blue-600 rounded-2xl transition-all">✏️</button>
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
                          <button onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }} className="text-gray-300 hover:text-blue-600">✏️</button>
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
                
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                  <button 
                    onClick={() => openStatement(c)} 
                    className="flex-1 py-2 bg-gray-900 text-white text-xs font-black rounded-lg uppercase"
                  >
                    Historial
                  </button>
                  <button 
                    onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }} 
                    className="flex-1 py-2 bg-emerald-600 text-white text-xs font-black rounded-lg uppercase"
                  >
                    Abonar
                  </button>
                  {canManageClientes && (
                    <button 
                      onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }} 
                      className="py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-blue-600 text-lg rounded-lg"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Abono */}
      {isAbonoOpen && selectedCliente && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 italic">Registrar Pago</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-10">{selectedCliente.nombre}</p>

            <form onSubmit={handleGeneralAbono} className="space-y-8">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 px-2">Monto del Abono</label>
                <input
                  type="number"
                  required
                  autoFocus
                  value={montoAbono || ''}
                  onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setMontoAbono(Number(e.target.value)) }}
                  className="w-full p-6 bg-gray-50 dark:bg-gray-900 rounded-[2rem] border-none font-black text-4xl text-emerald-600 text-center"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 px-2">Método de Recepción</label>
                <div className="grid grid-cols-3 gap-2">
                  {['efectivo', 'transferencia', 'tarjeta'].map(m => (
                    <button key={m} type="button" onClick={() => setMetodoPago(m)} className={`py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest border-2 transition-all ${metodoPago === m ? 'border-blue-600 bg-blue-600 text-white shadow-xl' : 'border-transparent bg-gray-50 text-gray-400'}`}>{m}</button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsAbonoOpen(false)} className="flex-1 font-black text-gray-400 uppercase text-[10px]">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:bg-black transition-all uppercase tracking-widest text-xs">Confirmar Abono</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Estado de Cuenta */}
      {isStatementOpen && selectedCliente && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-[3.5rem] p-12 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic">Historial de Cuenta</h2>
                <p className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em] mt-2">{selectedCliente.nombre} • RUT {selectedCliente.rut}</p>
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="w-14 h-14 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-3xl hover:rotate-90 transition-transform">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10">
              <div className="p-8 bg-red-50 dark:bg-red-900/10 rounded-[2.5rem] border-2 border-red-100 dark:border-red-900/30 text-center">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-2">Deuda Pendiente</p>
                <p className="text-4xl font-black text-red-600 tracking-tighter">{formatCurrency(selectedCliente.saldo_deudado)}</p>
              </div>
              <div className="p-8 bg-emerald-50 dark:bg-emerald-900/10 rounded-[2.5rem] border-2 border-emerald-100 dark:border-emerald-900/30 text-center">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Monto a favor (Billetera)</p>
                <p className="text-4xl font-black text-emerald-600 tracking-tighter">{formatCurrency(selectedCliente.saldo_favor)}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto space-y-4 pr-4 custom-scrollbar">
              {historial.map((mov, idx) => (
                <div key={mov.id + idx} className="p-6 bg-gray-50/50 dark:bg-gray-900/50 rounded-[2rem] flex justify-between items-center border border-transparent hover:border-blue-500/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm ${mov.tipo === 'venta' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {mov.tipo === 'venta' ? '📉' : '📈'}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{new Date(mov.fecha).toLocaleDateString()} • {new Date(mov.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="font-black text-gray-900 dark:text-white text-lg italic">{mov.referencia.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black tracking-tighter ${mov.tipo === 'venta' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {mov.tipo === 'venta' ? '-' : '+'}{formatCurrency(mov.monto)}
                    </p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Movimiento Confirmado</p>
                  </div>
                </div>
              ))}
              {historial.length === 0 && <div className="p-20 text-center text-gray-300 font-bold italic opacity-40 uppercase tracking-widest">Sin registros históricos.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ficha Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter">
              {selectedCliente ? 'Editar Ficha' : 'Nueva Ficha'}
            </h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-10">Información del Cliente</p>

            <form onSubmit={handleSaveCliente} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">RUT de Identidad</label>
                <input
                  required
                  autoFocus
                  placeholder="12.345.678-9"
                  value={formData.rut || ''}
                  onBlur={e => setFormData({ ...formData, rut: formatRUTVisual(e.target.value) })}
                  onChange={e => setFormData({ ...formData, rut: e.target.value })}
                  className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-2xl text-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Nombre o Razón Social</label>
                <input required value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-xl uppercase italic" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Teléfono Movil</label>
                <input value={formData.telefono || ''} onChange={e => setFormData({ ...formData, telefono: e.target.value.replace(/\D/g, '').slice(0, 9) })} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-xl" placeholder="+56 9..." />
              </div>

              <div className="flex gap-4 pt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase tracking-widest text-[10px]">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-xs">
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
