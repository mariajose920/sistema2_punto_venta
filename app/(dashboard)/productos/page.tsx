"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// Interfaz para definir la estructura de un Producto
interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  precio_compra: number;
  precio_venta: number;
  stock: number;
}

export default function ProductosPage() {
  const { role } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = useCallback(async () => {
    try {
      setLoading(true);
      
      // Consultamos la tabla 'Producto' en Supabase
      // Si la tabla aún no existe, el bloque catch manejará el error suavemente
      const { data, error } = await supabase
        .from('Producto')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) {
        throw error;
      }

      setProductos(data || []);
    } catch (err: unknown) {
      console.error('Error al cargar productos:', err);
      // Solo mostramos un error genérico si la tabla no existe o hay problemas de conexión
      setError('Aún no hay productos disponibles o falta configurar la tabla en la base de datos.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Al montar el componente, cargamos los productos desde Supabase
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProductos();
  }, [fetchProductos]);

  // Función para manejar la eliminación de un producto
  const handleEliminar = async (id: string) => {
    if (role === 'cajera') {
      // Lógica de "acción supervisada" para la cajera
      alert('Las eliminaciones realizadas por el rol "Cajera" se registrarán en el historial de supervisión para el administrador.');
      // TODO: Aquí se insertaría un registro en una tabla 'HistorialSupervision'
      return;
    }
    
    // Lógica directa para el Administrador
    const confirmar = window.confirm('¿Estás seguro de que deseas eliminar este producto permanentemente?');
    if (confirmar) {
      alert(`Producto ${id} eliminado (Simulación de UI)`);
      // Lógica real:
      // await supabase.from('Producto').delete().eq('id', id);
      // fetchProductos();
    }
  };

  // Función para manejar la edición de un producto
  const handleEditar = (id: string) => {
    if (role === 'cajera') {
       // Lógica de "acción supervisada" para la cajera
      alert('Las ediciones realizadas por el rol "Cajera" quedarán marcadas en el historial para revisión del administrador.');
      // TODO: Registrar en historial
    }
    alert(`Abriendo formulario para editar el producto ${id}`);
  };

  // Función para ver los detalles de un producto (Permitido para ambos roles sin supervisión)
  const handleVerDetalle = (id: string) => {
    alert(`Viendo la ficha completa del producto ${id}`);
  };

  // Mostramos un spinner mientras los datos están cargando
  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      
      {/* Encabezado de la página */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Catálogo de Productos</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestiona el inventario y precios de los artículos de tu tienda.
          </p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          Agregar Producto
        </button>
      </div>

      {/* Banner de información si ocurre un error */}
      {error && (
        <div className="p-4 m-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg text-yellow-800 dark:text-yellow-300 text-sm">
          <p className="flex items-center">
            <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
            {error}
          </p>
        </div>
      )}

      {/* Contenedor de la Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
          <thead className="bg-gray-50/80 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200 uppercase text-xs font-semibold tracking-wide">
            <tr>
              <th className="px-6 py-4 whitespace-nowrap">Código</th>
              <th className="px-6 py-4">Producto</th>
              <th className="px-6 py-4 text-center">Stock</th>
              
              {/* LÓGICA DE OCULTAMIENTO: Solo el rol Administrador puede ver el Precio de Compra */}
              {role === 'admin' && (
                <th className="px-6 py-4 text-right whitespace-nowrap text-blue-700 dark:text-blue-400">Precio Compra</th>
              )}
              
              <th className="px-6 py-4 text-right whitespace-nowrap">Precio Venta</th>
              <th className="px-6 py-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {productos.length === 0 ? (
              <tr>
                <td colSpan={role === 'admin' ? 6 : 5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  <p className="text-base font-medium">No hay productos en el sistema</p>
                  <p className="text-xs mt-1">Crea un nuevo producto para comenzar o verifica la base de datos.</p>
                </td>
              </tr>
            ) : (
              productos.map((prod) => (
                <tr key={prod.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{prod.codigo}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900 dark:text-white">{prod.nombre}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{prod.categoria}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      prod.stock > 10 
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                        : prod.stock > 0 
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                          : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                    }`}>
                      {prod.stock} unid.
                    </span>
                  </td>
                  
                  {/* Celda condicional para Admin */}
                  {role === 'admin' && (
                    <td className="px-6 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                      ${prod.precio_compra?.toFixed(2)}
                    </td>
                  )}
                  
                  <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                    ${prod.precio_venta?.toFixed(2)}
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex justify-center items-center space-x-3 opacity-80 group-hover:opacity-100 transition-opacity">
                      
                      {/* Botón Ver Detalle (Todos) */}
                      <button 
                        onClick={() => handleVerDetalle(prod.id)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-md transition-all"
                        title="Ver detalle"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                      </button>
                      
                      {/* Botón Editar (Supervisado para Cajera, Libre para Admin) */}
                      <button 
                        onClick={() => handleEditar(prod.id)}
                        className={`p-1.5 rounded-md transition-all ${
                          role === 'cajera' 
                            ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-700' 
                            : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-gray-700'
                        }`}
                        title={role === 'cajera' ? "Editar (Quedará registrado para supervisión)" : "Editar producto"}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>

                      {/* Botón Eliminar (Supervisado para Cajera, Libre para Admin) */}
                      <button 
                        onClick={() => handleEliminar(prod.id)}
                        className={`p-1.5 rounded-md transition-all ${
                          role === 'cajera' 
                            ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-700' 
                            : 'text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-700'
                        }`}
                        title={role === 'cajera' ? "Eliminar (Quedará registrado para supervisión)" : "Eliminar producto"}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
