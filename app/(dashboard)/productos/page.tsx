import { Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import ProductosClient from './ProductosClient';

async function getInitialData() {
  const startFetch = performance.now();

  const [prodResult, catResult] = await Promise.all([
    (supabase.from('Producto') as any)
      .select('id, nombre, categoria, codigo_barra, precio_compra, precio_venta_publico, stock_actual, stock_minimo, fuente_datos, imagen_url')
      .limit(1000),
    (supabase.from('Categoria') as any)
      .select('id, nombre, activo')
      .order('nombre', { ascending: true })
  ]);

  const endFetch = performance.now();
  console.log(`[PERF_CACHE] [SERVER] Tiempo de DB Fetch: ${(endFetch - startFetch).toFixed(2)}ms`);

  return {
    productos: prodResult.data || [],
    categorias: catResult.data || []
  };
}

// [BUILD FIX] Forzamos la ruta a dinámica para que next build NO intente prerenderizar estáticamente
// un dashboard que requiere conexión a DB en vivo.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProductosPage() {
  const startServerRender = performance.now();
  console.log(`[PERF_CACHE] [SERVER] Iniciando render de página ProductosPage`);

  return (
    <div className="space-y-6">
      {/* Suspense permite enviar el Skeleton al cliente inmediatamente, mientras DataFetcher espera la DB */}
      <Suspense fallback={<ProductosSkeleton />}>
        <DataFetcher />
      </Suspense>
    </div>
  );
}

// Componente servidor auxiliar que extrae los datos
async function DataFetcher() {
  const start = performance.now();
  const data = await getInitialData();
  const end = performance.now();
  
  console.log(`[PERF_CACHE] [SERVER] Tiempo de DataFetcher (resolución de cache/DB): ${(end - start).toFixed(2)}ms`);
  
  return (
    <ProductosClient 
      initialProductos={data.productos} 
      initialCategorias={data.categorias} 
    />
  );
}

// Skeleton ultrarrápido para UX fluida (Cold Start UX)
function ProductosSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-8">
      {/* Header Skeleton */}
      <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded-[2rem] w-1/3 mb-10"></div>
      
      {/* Grid de Productos Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="h-64 bg-gray-200 dark:bg-gray-800 rounded-[2.5rem]"></div>
        ))}
      </div>
    </div>
  );
}
