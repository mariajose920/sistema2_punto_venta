"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Componente {
  id: string;
  nombre: string;
  cantidad: number;
  precio_compra: number;
}

export default function CalculadoraCostos() {
  const [productos, setProductos] = useState<any[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [nuevoProducto, setNuevoProducto] = useState({
    nombre: '',
    categoria: 'General',
    precio_venta: 0,
    codigo_barra: ''
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    const { data } = await supabase.from('Producto').select('*').order('nombre');
    if (data) setProductos(data);
  };

  const agregarComponente = (id: string) => {
    const prod = productos.find(p => p.id === id);
    if (!prod) return;

    if (componentes.find(c => c.id === id)) return;

    setComponentes([...componentes, { 
      id: prod.id, 
      nombre: prod.nombre, 
      cantidad: 1, 
      precio_compra: prod.precio_compra 
    }]);
  };

  const actualizarCantidad = (id: string, cant: number) => {
    setComponentes(componentes.map(c => c.id === id ? { ...c, cantidad: cant } : c));
  };

  const eliminarComponente = (id: string) => {
    setComponentes(componentes.filter(c => c.id !== id));
  };

  const costoTotal = componentes.reduce((acc, c) => acc + (c.precio_compra * c.cantidad), 0);
  const margen = nuevoProducto.precio_venta - costoTotal;

  const guardarProducto = async () => {
    if (!nuevoProducto.nombre || nuevoProducto.precio_venta <= 0) {
      alert('Por favor ingresa nombre y precio de venta válido.');
      return;
    }

    setLoading(true);
    try {
      // 1. Crear el producto base
      const { data: prodData, error: prodError } = await (supabase as any).from('Producto').insert([{
        nombre: nuevoProducto.nombre,
        categoria: nuevoProducto.categoria,
        precio_compra: costoTotal,
        precio_venta_publico: nuevoProducto.precio_venta,
        codigo_barra: nuevoProducto.codigo_barra || null,
        stock_actual: 0,
        stock_minimo: 5
      }]).select().single();

      if (prodError) throw prodError;

      // 2. Guardar la composición (Receta) si existe la tabla
      const composiciones = componentes.map(c => ({
        id_producto_padre: prodData.id,
        id_producto_componente: c.id,
        cantidad: c.cantidad
      }));

      const { error: compError } = await (supabase as any).from('ComposicionProducto').insert(composiciones);
      
      if (compError) {
        console.warn('No se pudo guardar la composición técnica, pero el producto fue creado.');
      }

      alert('¡Producto calculado y guardado con éxito!');
      router.push('/productos');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">Calculadora de Costos</h1>
        <p className="text-gray-500">Crea nuevos productos basados en el costo de ingredientes existentes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Selector de Ingredientes */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-bold mb-4">1. Seleccionar Componentes</h2>
            <select 
              className="w-full p-3 rounded-xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700 mb-6"
              onChange={(e) => agregarComponente(e.target.value)}
              value=""
            >
              <option value="" disabled>Seleccionar producto para añadir...</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} (${p.precio_compra})</option>
              ))}
            </select>

            <div className="space-y-3">
              {componentes.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <div className="flex-1">
                    <p className="font-bold text-sm">{c.nombre}</p>
                    <p className="text-xs text-gray-500">Costo unitario: ${c.precio_compra}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <input 
                      type="number" 
                      min="0.01" 
                      step="0.01"
                      value={c.cantidad}
                      onChange={(e) => actualizarCantidad(c.id, parseFloat(e.target.value))}
                      className="w-20 p-2 text-center rounded-lg border border-gray-200 dark:bg-gray-900"
                    />
                    <button onClick={() => eliminarComponente(c.id)} className="text-red-500 hover:scale-110 transition-transform">🗑️</button>
                  </div>
                </div>
              ))}
              {componentes.length === 0 && (
                <p className="text-center py-8 text-gray-400 italic text-sm">No hay componentes seleccionados.</p>
              )}
            </div>
          </div>
        </div>

        {/* Resumen y Guardado */}
        <div className="space-y-6">
          <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-xl shadow-blue-200 dark:shadow-none">
            <h2 className="text-lg font-bold mb-4">Resumen de Costos</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-blue-100">
                <span>Costo de Producción:</span>
                <span className="font-bold text-white">${costoTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-blue-100">
                <span>Precio de Venta:</span>
                <span className="font-bold text-white">${nuevoProducto.precio_venta.toFixed(2)}</span>
              </div>
              <div className="h-px bg-blue-500 my-4"></div>
              <div className="flex justify-between text-xl font-black">
                <span>Margen:</span>
                <span className={margen >= 0 ? 'text-green-300' : 'text-red-300'}>
                  ${margen.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
            <h2 className="text-lg font-bold">2. Datos del Producto</h2>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Nombre Final</label>
              <input 
                type="text" 
                placeholder="Ej: Pan con Huevo"
                className="w-full p-3 mt-1 rounded-xl border border-gray-200 dark:bg-gray-800"
                value={nuevoProducto.nombre}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Precio Venta sugerido</label>
              <input 
                type="number" 
                className="w-full p-3 mt-1 rounded-xl border border-gray-200 dark:bg-gray-900 font-bold text-blue-600"
                value={nuevoProducto.precio_venta}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, precio_venta: parseFloat(e.target.value) })}
              />
            </div>
            <button 
              onClick={guardarProducto}
              disabled={loading || componentes.length === 0}
              className="w-full py-4 bg-gray-900 dark:bg-blue-600 text-white rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Crear Producto Final'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
