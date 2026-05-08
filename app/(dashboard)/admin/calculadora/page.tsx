"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { normalizeText, logAction, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface Componente {
  id: string;
  nombre: string;
  cantidad: number;
  precio_compra: number;
}

export default function CalculadoraCostos() {
  const { user, role } = useAuth();
  const [productos, setProductos] = useState<any[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [nuevoProducto, setNuevoProducto] = useState({
    nombre: '',
    categoria: 'elaborado',
    precio_venta: 0,
    codigo_barra: ''
  });
  
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fetchProductos = useCallback(async () => {
    const { data } = await supabase.from('Producto').select('*').order('nombre');
    if (data) setProductos(data);
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const agregarComponente = (prod: any) => {
    if (componentes.find(c => c.id === prod.id)) {
        alert('Este componente ya está en la lista.');
        return;
    }

    setComponentes([...componentes, { 
      id: prod.id, 
      nombre: prod.nombre, 
      cantidad: 1, 
      precio_compra: prod.precio_compra 
    }]);
    setSearch('');
    setShowSearch(false);
  };

  const actualizarCantidad = (id: string, cant: number) => {
    const safeCant = isNaN(cant) ? 0 : Math.max(0, cant);
    setComponentes(componentes.map(c => c.id === id ? { ...c, cantidad: safeCant } : c));
  };

  const eliminarComponente = (id: string) => {
    setComponentes(componentes.filter(c => c.id !== id));
  };

  const costoTotal = componentes.reduce((acc, c) => acc + (c.precio_compra * c.cantidad), 0);
  const margen = nuevoProducto.precio_venta - costoTotal;

  const guardarProducto = async () => {
    const nombreNorm = normalizeText(nuevoProducto.nombre);
    if (!nombreNorm || nuevoProducto.precio_venta <= 0) {
      alert('Por favor ingresa un nombre y precio de venta válido.');
      return;
    }

    try {
      setLoading(true);

      // Verificar duplicado
      const { data: exist } = await supabase.from('Producto').select('id').eq('nombre', nombreNorm).maybeSingle();
      if (exist) {
        alert('Ya existe un producto con ese nombre. Por favor usa uno diferente.');
        setLoading(false);
        return;
      }

      // 1. Crear el producto base
      const { data: prodData, error: prodError } = await (supabase as any).from('Producto').insert([{
        nombre: nombreNorm,
        categoria: normalizeText(nuevoProducto.categoria),
        precio_compra: Math.round(costoTotal),
        precio_venta_publico: Math.round(nuevoProducto.precio_venta),
        codigo_barra: nuevoProducto.codigo_barra.trim() || null,
        stock_actual: 0,
        stock_minimo: 5
      }]).select().single();

      if (prodError) throw prodError;

      // 2. Intentar guardar Composición (Opcional según esquema)
      try {
          const composiciones = componentes.map(c => ({
            id_producto_padre: prodData.id,
            id_producto_componente: c.id,
            cantidad: c.cantidad
          }));
          await (supabase as any).from('ComposicionProducto').insert(composiciones);
      } catch (e) {
          console.warn('Tabla ComposicionProducto no disponible o error en inserción.');
      }

      // 3. Auditoría
      if (user) {
          await logAction(supabase, {
            usuario_id: user.id,
            email_usuario: user.email!,
            accion: 'creacion',
            modulo: 'productos',
            detalle: `calculó y creó producto elaborado: ${nombreNorm} (Costo: ${Math.round(costoTotal)})`
          });
      }

      alert('¡Producto calculado y guardado con éxito!');
      router.push('/productos');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (role !== 'admin') {
      return <div className="p-20 text-center font-black text-red-500 uppercase tracking-[0.5em]">Acceso Restringido</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
      
      {/* Header Premium */}
      <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/10 rounded-full -mr-16 -mt-16"></div>
        <div className="relative">
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter italic uppercase">Laboratorio de Costos</h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em] mt-2 italic">Ingeniería de Productos y Composición</p>
        </div>
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl shadow-xl shadow-indigo-100 dark:shadow-none relative">🧮</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Lado Izquierdo: Composición */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Buscador de Ingredientes */}
          <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 relative">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 italic">1. Selección de Componentes</h2>
            <div className="relative">
                <input 
                type="text" 
                placeholder="Escribe nombre de ingrediente o base..." 
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSearch(e.target.value.length > 0); }}
                className="w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-sm italic focus:ring-4 focus:ring-indigo-600/10 transition-all uppercase"
                />
                {showSearch && (
                <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2rem] shadow-2xl z-50 max-h-80 overflow-auto animate-in slide-in-from-top-2 duration-300">
                    {productos.filter(p => normalizeText(p.nombre).includes(normalizeText(search))).length === 0 ? (
                        <div className="p-10 text-center text-gray-300 font-black uppercase text-[10px] tracking-widest">Sin resultados</div>
                    ) : productos.filter(p => normalizeText(p.nombre).includes(normalizeText(search))).map(p => (
                    <button key={p.id} onClick={() => agregarComponente(p)} className="w-full p-6 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border-b last:border-0 border-gray-50 dark:border-gray-700 flex justify-between items-center group">
                        <div>
                        <p className="font-black text-gray-900 dark:text-white uppercase italic text-sm group-hover:text-indigo-600 transition-colors">{p.nombre}</p>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{p.categoria}</p>
                        </div>
                        <p className="font-black text-indigo-600 text-lg">${formatCurrency(p.precio_compra)}</p>
                    </button>
                    ))}
                </div>
                )}
            </div>
          </div>

          {/* Lista de Componentes Activos */}
          <div className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/30">
                <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest italic">Receta / Composición Técnica</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {componentes.map(c => (
                <div key={c.id} className="p-8 flex flex-col md:flex-row items-center justify-between gap-6 hover:bg-gray-50/50 transition-all group">
                  <div className="flex-1">
                    <p className="font-black text-gray-900 dark:text-white uppercase italic text-lg">{c.nombre}</p>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 italic">Costo Base: ${formatCurrency(c.precio_compra)}</p>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="flex flex-col items-center">
                        <label className="text-[8px] font-black text-gray-400 uppercase mb-2">Cantidad</label>
                        <input 
                        type="number" 
                        min="0.01" 
                        step="0.01"
                        value={c.cantidad}
                        onChange={(e) => actualizarCantidad(c.id, parseFloat(e.target.value))}
                        className="w-24 p-3 text-center rounded-xl bg-gray-50 dark:bg-gray-900 border-none font-black text-lg focus:ring-4 focus:ring-indigo-600/10"
                        />
                    </div>
                    <div className="text-right min-w-[100px]">
                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Subtotal</p>
                        <p className="text-xl font-black text-indigo-600 italic tracking-tighter">${formatCurrency(c.precio_compra * c.cantidad)}</p>
                    </div>
                    <button onClick={() => eliminarComponente(c.id)} className="w-12 h-12 flex items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm">🗑️</button>
                  </div>
                </div>
              ))}
              {componentes.length === 0 && (
                <div className="py-32 text-center flex flex-col items-center">
                    <span className="text-6xl opacity-10 mb-6 grayscale">🥣</span>
                    <p className="text-gray-300 font-black uppercase tracking-[0.4em] text-[10px] italic">Añade componentes para iniciar el cálculo</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lado Derecho: Resultado y Guardado */}
        <div className="space-y-8">
          
          {/* Card de Margen Dinámico */}
          <div className="bg-indigo-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-indigo-200 dark:shadow-none relative overflow-hidden group">
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/10 rounded-full -mb-20 -mr-20 group-hover:scale-110 transition-transform"></div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] mb-10 italic border-l-4 border-indigo-400 pl-4">Matriz de Rentabilidad</h2>
            
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-indigo-200">Costo Producción</span>
                <span className="font-black text-2xl tracking-tighter italic">${formatCurrency(costoTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-indigo-200">PVP Sugerido</span>
                <span className="font-black text-2xl tracking-tighter italic">${formatCurrency(nuevoProducto.precio_venta)}</span>
              </div>
              
              <div className="h-px bg-white/20 my-6"></div>
              
              <div className="text-center bg-white/10 p-6 rounded-[2rem] border border-white/10">
                <p className="text-[9px] font-black uppercase tracking-[0.5em] mb-2 opacity-60">Margen Bruto Estimado</p>
                <p className={`text-5xl font-black tracking-tighter italic ${margen >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  ${formatCurrency(margen)}
                </p>
              </div>
            </div>
          </div>

          {/* Formulario de Definición */}
          <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic mb-6">2. Identidad del Producto</h2>
            
            <div className="space-y-6">
                <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre del Producto Final</label>
                    <input 
                        type="text" 
                        placeholder="Ej: Plato Especial XL"
                        className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-lg italic uppercase"
                        value={nuevoProducto.nombre}
                        onChange={(e) => setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })}
                    />
                </div>
                
                <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Precio de Venta al Público ($)</label>
                    <input 
                        type="number" 
                        className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl border-none font-black text-2xl tracking-tighter italic"
                        value={nuevoProducto.precio_venta}
                        onChange={(e) => setNuevoProducto({ ...nuevoProducto, precio_venta: parseFloat(e.target.value) || 0 })}
                    />
                </div>

                <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Código Barras (Opcional)</label>
                    <input 
                        type="text" 
                        placeholder="780..."
                        className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none font-black text-sm"
                        value={nuevoProducto.codigo_barra}
                        onChange={(e) => setNuevoProducto({ ...nuevoProducto, codigo_barra: e.target.value })}
                    />
                </div>

                <div className="pt-6">
                    <button 
                        onClick={guardarProducto}
                        disabled={loading || componentes.length === 0}
                        className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95 ${loading || componentes.length === 0 ? 'bg-gray-100 text-gray-300 shadow-none' : 'bg-gray-900 hover:bg-indigo-600 text-white shadow-indigo-100 dark:shadow-none'}`}
                    >
                        {loading ? 'PROCESANDO...' : 'REGISTRAR PRODUCTO'}
                    </button>
                </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
