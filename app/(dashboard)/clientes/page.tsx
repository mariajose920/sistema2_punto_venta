"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  saldo_deudado: number;
  saldo_favor: number;
  created_at: string;
}

interface Movimiento {
  id: string;
  tipo: 'venta' | 'pago';
  monto: number;
  fecha: string;
  referencia: string;
}

export default function ClientesPage() {
  const { role, user } = useAuth();
  
  // Estados de datos
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtered, setFiltered] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isAbonoOpen, setIsAbonoOpen] = useState(false);
  
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historial, setHistorial] = useState<Movimiento[]>([]);
  
  // Formulario Abono
  const [montoAbono, setMontoAbono] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // Formulario Cliente
  const [formData, setFormData] = useState<Partial<Cliente>>({
    nombre: '',
    telefono: '',
  });

  // Utilidades de RUT
  const cleanRUT = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();

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

  const formatRUT = (rut: string) => {
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

  // 1. Cargar clientes
  const fetchClientes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any).from('Cliente').select('*').order('nombre');
      if (error) throw error;
      setClientes(data || []);
      setFiltered(data || []);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  useEffect(() => {
    const term = search.toLowerCase();
    setFiltered(clientes.filter(c => 
      c.nombre.toLowerCase().includes(term) || (c as any).rut?.includes(term)
    ));
  }, [search, clientes]);

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.nombre) throw new Error('El nombre es obligatorio');
      if (!(formData as any).rut) throw new Error('El RUT es obligatorio');
      
      const rutNormalizado = formatRUT((formData as any).rut);
      if (!validateRUT(rutNormalizado)) throw new Error('El RUT ingresado no es válido');

      setLoading(true);

      // Validar duplicado de RUT
      const { data: existente } = await (supabase as any)
        .from('Cliente')
        .select('id, nombre')
        .eq('rut', rutNormalizado)
        .neq('id', selectedCliente?.id || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (existente) {
        throw new Error(`Ya existe un cliente registrado con el RUT: ${rutNormalizado} (${existente.nombre})`);
      }

      const finalData = { ...formData, rut: rutNormalizado };

      if (selectedCliente?.id) {
        const { error } = await (supabase as any).from('Cliente').update(finalData).eq('id', selectedCliente.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('Cliente').insert([finalData]);
        if (error) throw error;
      }
      
      setIsModalOpen(false);
      fetchClientes();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openStatement = async (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsStatementOpen(true);
    
    try {
      const [
        { data: ventas },
        { data: pagos }
      ] = await Promise.all([
        (supabase as any).from('Venta').select('id_venta, total_venta, fecha_venta').eq('id_cliente', cliente.id).eq('forma_pago', 'fiado'),
        (supabase as any).from('Pago').select('id, monto, created_at, metodo_pago').eq('cliente_id', cliente.id)
      ]);

      const movs: Movimiento[] = [
        ...(ventas || []).map((v: any) => ({
          id: v.id_venta,
          tipo: 'venta' as const,
          monto: v.total_venta,
          fecha: v.fecha_venta,
          referencia: `Venta #${v.id_venta.slice(0, 8)}`
        })),
        ...(pagos || []).map((p: any) => ({
          id: p.id,
          tipo: 'pago' as const,
          monto: p.monto,
          fecha: p.created_at,
          referencia: `Abono (${p.metodo_pago})`
        }))
      ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      setHistorial(movs);
    } catch (err) {
      console.error('Error cargando historial:', err);
    }
  };

  const handleGeneralAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente || montoAbono <= 0) return;

    try {
      setLoading(true);
      
      // 1. Registrar el Pago
      const { error: pError } = await (supabase as any).from('Pago').insert([{
        cliente_id: selectedCliente.id,
        monto: montoAbono,
        metodo_pago: metodoPago
      }]);
      if (pError) throw pError;

      // 2. Calcular impacto en deuda y saldo a favor
      let nuevaDeuda = selectedCliente.saldo_deudado - montoAbono;
      let nuevoSaldoFavor = selectedCliente.saldo_favor;

      if (nuevaDeuda < 0) {
        nuevoSaldoFavor += Math.abs(nuevaDeuda);
        nuevaDeuda = 0;
      }

      // 3. Actualizar Cliente
      const { error: cError } = await (supabase.from('Cliente') as any).update({
        saldo_deudado: nuevaDeuda,
        saldo_favor: nuevoSaldoFavor
      }).eq('id', selectedCliente.id);
      if (cError) throw cError;

      // 4. Saldar créditos pendientes (Lógica interna: reduce saldo_pendiente de los créditos más viejos)
      const { data: creditos } = await (supabase as any)
        .from('Credito')
        .select('*')
        .eq('cliente_id', selectedCliente.id)
        .eq('estado', 'vigente')
        .order('created_at', { ascending: true });

      if (creditos && creditos.length > 0) {
        let restante = montoAbono;
        for (const cred of creditos) {
          if (restante <= 0) break;
          const aPagar = Math.min(cred.saldo_pendiente, restante);
          const nuevoSaldoCred = cred.saldo_pendiente - aPagar;
          await (supabase.from('Credito') as any).update({
            saldo_pendiente: nuevoSaldoCred,
            estado: nuevoSaldoCred <= 0 ? 'pagado' : 'vigente'
          }).eq('id', cred.id);
          restante -= aPagar;
        }
      }

      alert('Abono registrado con éxito');
      setIsAbonoOpen(false);
      setMontoAbono(0);
      fetchClientes();
      if (isStatementOpen) openStatement({ ...selectedCliente, saldo_deudado: nuevaDeuda, saldo_favor: nuevoSaldoFavor });
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header Premium */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Cuentas por Cobrar</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 italic">Gestión de Clientes y Fiados</p>
        </div>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative flex-1 md:w-80">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar por nombre o RUT..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-600/10 transition-all"
            />
          </div>
          {role === 'admin' && (
            <button 
              onClick={() => { setSelectedCliente(null); setFormData({ nombre: '', telefono: '', rut: '' } as any); setIsModalOpen(true); }}
              className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all"
            >
              Nuevo Cliente
            </button>
          )}
        </div>
      </div>

      {/* Grid de Clientes con Resumen de Deuda */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && clientes.length === 0 ? (
          <div className="col-span-full py-20 text-center animate-pulse text-gray-400 font-bold">Consultando saldos...</div>
        ) : filtered.map(c => (
          <div key={c.id} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white truncate max-w-[150px]">{c.nombre}</h3>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest italic">{(c as any).rut || 'Sin RUT'}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase">{c.telefono || 'Sin contacto'}</p>
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg ${c.saldo_deudado > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}>
                {c.nombre.charAt(0).toUpperCase()}
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Deuda Pendiente</p>
                <p className={`text-2xl font-black tracking-tighter ${c.saldo_deudado > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                  ${c.saldo_deudado.toLocaleString()}
                </p>
              </div>
              {c.saldo_favor > 0 && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Saldo a Favor</p>
                  <p className="text-xl font-black text-emerald-600 tracking-tighter">
                    ${c.saldo_favor.toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => openStatement(c)}
                className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all"
              >
                Movimientos
              </button>
              <button 
                onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
              >
                Abonar
              </button>
              {role === 'admin' && (
                <button 
                  onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }}
                  className="p-3 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded-xl hover:text-blue-600 transition-all"
                >
                  ✏️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Abono Premium */}
      {isAbonoOpen && selectedCliente && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2 italic">Registrar Abono</h2>
            <p className="text-sm text-gray-400 font-bold mb-8">Cliente: {selectedCliente.nombre}</p>
            
            <form onSubmit={handleGeneralAbono} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Monto a Recibir ($)</label>
                <input 
                  type="number" 
                  required 
                  autoFocus
                  value={montoAbono} 
                  onChange={e => setMontoAbono(Number(e.target.value))} 
                  className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-3xl text-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition-all"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Medio de Pago</label>
                <div className="grid grid-cols-2 gap-3">
                  {['efectivo', 'transferencia', 'tarjeta'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${metodoPago === m ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-50 text-gray-400'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsAbonoOpen(false)} className="flex-1 font-bold text-gray-400">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-5 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 dark:shadow-none hover:bg-emerald-700 transition-all">
                  {loading ? 'PROCESANDO...' : 'CONFIRMAR PAGO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Estado de Cuenta Detallado */}
      {isStatementOpen && selectedCliente && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-8 shrink-0">
              <div>
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter italic">Estado de Cuenta</h2>
                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">{selectedCliente.nombre}</p>
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="w-12 h-12 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-2xl hover:rotate-90 transition-transform">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8 shrink-0">
              <div className="p-6 bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-100 dark:border-red-900/30 text-center">
                <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Deuda Actual</p>
                <p className="text-3xl font-black text-red-600 tracking-tighter">${selectedCliente.saldo_deudado.toLocaleString()}</p>
              </div>
              <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Saldo a Favor</p>
                <p className="text-3xl font-black text-emerald-600 tracking-tighter">${selectedCliente.saldo_favor.toLocaleString()}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto space-y-4 pr-2 custom-scrollbar">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Cronología de Movimientos</h3>
              {historial.map((mov, idx) => (
                <div key={mov.id + idx} className="p-6 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl flex justify-between items-center group hover:border-blue-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${mov.tipo === 'venta' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                      {mov.tipo === 'venta' ? '📉' : '📈'}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">{new Date(mov.fecha).toLocaleDateString()} - {new Date(mov.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      <p className="font-bold text-gray-900 dark:text-white text-sm">{mov.referencia}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black tracking-tighter ${mov.tipo === 'venta' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {mov.tipo === 'venta' ? '-' : '+'}${mov.monto.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-black text-gray-400 uppercase">Procesado</p>
                  </div>
                </div>
              ))}
              {historial.length === 0 && <div className="p-20 text-center text-gray-300 font-bold italic">No hay movimientos registrados para este cliente.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal Formulario Cliente (Admin) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-8 italic">
              {selectedCliente ? 'Actualizar Cliente' : 'Nuevo Cliente en Sistema'}
            </h2>
            <form onSubmit={handleSaveCliente} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">RUT (Sin puntos ni guion)</label>
                <input 
                  required 
                  autoFocus
                  placeholder="12345678-9"
                  value={(formData as any).rut || ''} 
                  onBlur={e => setFormData({...formData, rut: formatRUT(e.target.value)} as any)}
                  onChange={e => setFormData({...formData, rut: e.target.value} as any)} 
                  className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border-none font-black text-xl text-blue-600" 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre Completo / Razón Social</label>
                <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="Ej: Juan Pérez" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Teléfono de Contacto</label>
                <input value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold" placeholder="+56 9..." />
              </div>
              
              <div className="flex gap-4 pt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold text-gray-400">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[2] py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all">
                  {loading ? 'GUARDANDO...' : selectedCliente ? 'ACTUALIZAR FICHA' : 'CREAR CLIENTE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
