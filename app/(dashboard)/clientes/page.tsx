"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeText, cleanRUT, logAction, formatCurrency } from '@/lib/utils';

interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  rut: string;
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isAbonoOpen, setIsAbonoOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historial, setHistorial] = useState<Movimiento[]>([]);
  
  // Formulario Abono
  const [montoAbono, setMontoAbono] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // Formulario Cliente
  const [formData, setFormData] = useState<Partial<Cliente>>({
    nombre: '',
    telefono: '',
    rut: ''
  });

  // Utilidades de RUT local para el input dinámico
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

  const formatRUTDisplay = (rut: string) => {
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
      setErrorMsg(null);
      const { data, error } = await (supabase as any)
        .from('Cliente')
        .select('*')
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      
      setClientes(data || []);
      setFiltered(data || []);
    } catch (err: any) {
      console.error('Error cargando clientes:', err);
      setErrorMsg(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  useEffect(() => {
    const term = normalizeText(search);
    const termClean = cleanRUT(search);
    
    setFiltered(clientes.filter(c => 
      normalizeText(c.nombre).includes(term) || 
      cleanRUT(c.rut || '').includes(termClean)
    ));
  }, [search, clientes]);

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.nombre) throw new Error('El nombre es obligatorio');
      const nombreNorm = normalizeText(formData.nombre);
      
      if (!formData.rut) throw new Error('El RUT es obligatorio');
      const rutClean = cleanRUT(formData.rut);
      const rutFormateado = formatRUTDisplay(rutClean);
      
      if (!validateRUT(rutClean)) throw new Error('El RUT ingresado no es válido');

      setLoading(true);

      // Validar duplicado de RUT
      const { data: existente } = await (supabase as any)
        .from('Cliente')
        .select('id, nombre')
        .eq('rut', rutFormateado)
        .neq('id', selectedCliente?.id || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (existente) {
        throw new Error(`Ya existe un cliente con el RUT: ${rutFormateado} (${existente.nombre})`);
      }

      const finalData = { 
        ...formData, 
        nombre: nombreNorm,
        rut: rutFormateado 
      };

      if (selectedCliente?.id) {
        const { error } = await (supabase as any).from('Cliente').update(finalData).eq('id', selectedCliente.id);
        if (error) throw error;
        
        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'edicion',
          modulo: 'clientes',
          detalle: `actualizó datos del cliente: ${nombreNorm}`
        });
      } else {
        const { error } = await (supabase as any).from('Cliente').insert([finalData]);
        if (error) throw error;

        await logAction(supabase, {
          usuario_id: user?.id || '',
          email_usuario: user?.email || '',
          accion: 'creacion',
          modulo: 'clientes',
          detalle: `creó nuevo cliente: ${nombreNorm}`
        });
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
      
      const { data: freshCliente, error: fError } = await (supabase as any)
        .from('Cliente')
        .select('saldo_deudado, saldo_favor')
        .eq('id', selectedCliente.id)
        .single();
      
      if (fError || !freshCliente) throw new Error('No se pudo obtener el saldo actual');

      const saldoDeudadoActual = freshCliente.saldo_deudado || 0;
      const saldoFavorActual = freshCliente.saldo_favor || 0;

      // 1. Registrar Pago
      const { error: pError } = await (supabase as any).from('Pago').insert([{
        cliente_id: selectedCliente.id,
        monto: montoAbono,
        metodo_pago: metodoPago
      }]);
      if (pError) throw pError;

      // 2. Lógica REGLA: Deuda -> Favor
      let nuevaDeuda = saldoDeudadoActual - montoAbono;
      let nuevoSaldoFavor = saldoFavorActual;

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

      // 4. Auditoría
      await logAction(supabase, {
        usuario_id: user?.id || '',
        email_usuario: user?.email || '',
        accion: 'abono',
        modulo: 'clientes',
        detalle: `registró abono de $${formatCurrency(montoAbono)} para ${selectedCliente.nombre}`
      });

      alert(`Abono procesado. Nuevo saldo deudor: $${formatCurrency(nuevaDeuda)}. Nuevo saldo favor: $${formatCurrency(nuevoSaldoFavor)}.`);
      setIsAbonoOpen(false);
      setMontoAbono(0);
      fetchClientes();
      
      if (isStatementOpen) {
        openStatement({ ...selectedCliente, saldo_deudado: nuevaDeuda, saldo_favor: nuevoSaldoFavor });
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      
      {/* Header Premium */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-xl shadow-blue-200 dark:shadow-none">👤</div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Cuentas Corrientes</h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-1 italic">Gestión de Deuda y Saldo a Favor</p>
          </div>
        </div>

        <div className="flex w-full md:w-auto gap-4">
          <div className="relative flex-1 md:w-96">
            <input 
              type="text" 
              placeholder="Buscar por nombre o RUT (ej: 12345678-9)..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-6 pr-4 py-5 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-600/10 transition-all italic"
            />
          </div>
          {role === 'admin' && (
            <button 
              onClick={() => { setSelectedCliente(null); setFormData({ nombre: '', telefono: '', rut: '' }); setIsModalOpen(true); }}
              className="bg-gray-900 text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all"
            >
              Nuevo Cliente
            </button>
          )}
        </div>
      </div>

      {loading && clientes.length === 0 ? (
        <div className="py-20 text-center animate-pulse text-gray-300 font-black uppercase tracking-[0.3em]">Sincronizando Carteras...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 font-bold italic border-4 border-dashed border-gray-50 dark:border-gray-800/50 rounded-[3rem]">
           No se encontraron coincidencias.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {filtered.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-900/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
              
              <div className="flex justify-between items-start mb-10 relative">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white truncate max-w-[200px] uppercase italic tracking-tighter">{c.nombre}</h3>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">{c.rut}</p>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-xl ${c.saldo_deudado > 0 ? 'bg-red-500 shadow-red-200' : 'bg-emerald-500 shadow-emerald-200'} dark:shadow-none`}>
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-800">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 italic text-center">Deuda Fiado</p>
                  <p className={`text-3xl font-black tracking-tighter text-center ${c.saldo_deudado > 0 ? 'text-red-600' : 'text-gray-200'}`}>
                    ${formatCurrency(c.saldo_deudado)}
                  </p>
                </div>
                <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-800/30">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2 italic text-center">Wallet Favor</p>
                  <p className={`text-3xl font-black tracking-tighter text-center ${c.saldo_favor > 0 ? 'text-emerald-600' : 'text-gray-200'}`}>
                    ${formatCurrency(c.saldo_favor)}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 relative">
                <button onClick={() => openStatement(c)} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all">Historial</button>
                <button onClick={() => { setSelectedCliente(c); setIsAbonoOpen(true); }} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-100 dark:shadow-none">Realizar Abono</button>
                {role === 'admin' && (
                  <button onClick={() => { setSelectedCliente(c); setFormData(c); setIsModalOpen(true); }} className="w-12 h-12 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all">✏️</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Abono */}
      {isAbonoOpen && selectedCliente && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-md rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 relative">
             <button onClick={() => setIsAbonoOpen(false)} className="absolute top-8 right-8 text-2xl opacity-20 hover:opacity-100">✕</button>
            
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter">Registrar Pago</h2>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-10">Titular: {selectedCliente.nombre}</p>
            
            <form onSubmit={handleGeneralAbono} className="space-y-8">
              <div className="p-8 bg-gray-50 dark:bg-gray-900 rounded-[2.5rem] border-2 border-dashed border-gray-200 dark:border-gray-700">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 text-center">Efectivo / Monto del Abono</label>
                <input 
                  type="number" 
                  required 
                  autoFocus
                  value={montoAbono || ''} 
                  onChange={e => setMontoAbono(Number(e.target.value))} 
                  className="w-full bg-transparent border-none text-center font-black text-6xl text-emerald-600 focus:ring-0"
                  placeholder="0"
                />
                <p className="text-[10px] text-gray-400 font-bold text-center mt-4">El excedente se guardará como Saldo a Favor.</p>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Medio de Captura</label>
                <div className="grid grid-cols-3 gap-3">
                  {['efectivo', 'transferencia', 'tarjeta'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className={`py-3 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 transition-all ${metodoPago === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-transparent text-gray-400 border-gray-100 dark:border-gray-700'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-4">
                <button type="submit" disabled={loading} className="w-full py-6 bg-blue-600 text-white font-black rounded-3xl shadow-2xl shadow-blue-200 dark:shadow-none hover:bg-blue-500 transition-all uppercase tracking-widest text-xs">
                  {loading ? 'SINCRONIZANDO...' : 'PROCESAR ABONO'}
                </button>
                <button type="button" onClick={() => setIsAbonoOpen(false)} className="w-full py-4 text-gray-400 font-black text-[10px] uppercase tracking-widest">Descartar Operación</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {isStatementOpen && selectedCliente && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-[3rem] p-12 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 relative">
            <button onClick={() => setIsStatementOpen(false)} className="absolute top-8 right-8 w-12 h-12 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center text-xl hover:rotate-90 transition-all">✕</button>
            
            <div className="mb-12">
                <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic uppercase">Estado de Cuenta</h2>
                <div className="flex items-center gap-4 mt-2">
                    <span className="text-blue-600 font-black uppercase text-[10px] tracking-widest">{selectedCliente.nombre}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                    <span className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">{selectedCliente.rut}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-12 shrink-0">
              <div className="p-8 bg-red-50 dark:bg-red-900/10 rounded-[2.5rem] border-2 border-red-100 dark:border-red-900/20 text-center">
                <p className="text-[9px] font-black text-red-600 uppercase tracking-[0.3em] mb-2">Total Adeudado</p>
                <p className="text-4xl font-black text-red-600 tracking-tighter italic">${formatCurrency(selectedCliente.saldo_deudado)}</p>
              </div>
              <div className="p-8 bg-emerald-50 dark:bg-emerald-900/10 rounded-[2.5rem] border-2 border-emerald-100 dark:border-emerald-900/20 text-center">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-2">Wallet a Favor</p>
                <p className="text-4xl font-black text-emerald-600 tracking-tighter italic">${formatCurrency(selectedCliente.saldo_favor)}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto space-y-4 pr-4 custom-scrollbar">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em] mb-6 pl-4 border-l-4 border-blue-600">Línea de Tiempo</h3>
              {historial.map((mov, idx) => (
                <div key={mov.id + idx} className="p-8 bg-gray-50/50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 rounded-[2rem] flex justify-between items-center group hover:bg-white dark:hover:bg-gray-800 transition-all">
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm ${mov.tipo === 'venta' ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-500'}`}>
                      {mov.tipo === 'venta' ? '💸' : '💰'}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 opacity-60">
                        {new Date(mov.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="font-black text-gray-900 dark:text-white text-lg tracking-tight italic uppercase">{mov.referencia}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black tracking-tighter italic ${mov.tipo === 'venta' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {mov.tipo === 'venta' ? '-' : '+'}${formatCurrency(mov.monto)}
                    </p>
                  </div>
                </div>
              ))}
              {historial.length === 0 && <div className="py-20 text-center text-gray-300 font-black uppercase tracking-widest text-xs opacity-50">Sin registros históricos.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal Formulario Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-2xl opacity-20">✕</button>
            
            <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-10 italic tracking-tighter">
              {selectedCliente ? 'Modificar Registro' : 'Alta de Cliente'}
            </h2>
            <form onSubmit={handleSaveCliente} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">RUT del Cliente</label>
                <input 
                  required 
                  autoFocus
                  placeholder="ej: 12.345.678-9"
                  value={formData.rut || ''} 
                  onChange={e => setFormData({...formData, rut: e.target.value})} 
                  className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-2xl text-blue-600 tracking-tighter" 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Nombre Completo / Empresa</label>
                <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg italic" placeholder="Ej: Maria José Villegas" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">WhatsApp / Teléfono</label>
                <input value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-bold text-lg" placeholder="+56 9..." />
              </div>
              
              <div className="flex gap-4 pt-10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase tracking-widest text-[10px]">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[3] py-6 bg-gray-900 text-white font-black rounded-3xl shadow-2xl hover:bg-blue-600 transition-all uppercase tracking-[0.2em] text-xs">
                  {loading ? 'PROCESANDO...' : selectedCliente ? 'ACTUALIZAR DATOS' : 'DAR DE ALTA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
