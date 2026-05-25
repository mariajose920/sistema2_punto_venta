import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { measureAsync } from './perf';

export type CatalogProduct = {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta_publico: number | null;
  stock_actual: number | null;
  imagen_url: string | null;
};

type CatalogQueryItem = {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta_publico: number | null;
  stock_actual: number | null;
  imagen_url: string | null;
};

async function loadCatalogProducts(): Promise<CatalogProduct[]> {
  const result = await measureAsync(
    '[Cache] catalogo-productos',
    async () => {
      const response = await supabase
        .from('Producto')
        .select('id, nombre, categoria, precio_venta_publico, stock_actual, imagen_url')
        .gt('stock_actual', 0)
        .order('nombre');

      const data = response.data as CatalogQueryItem[] | null;
      const error = response.error;

      if (error) {
        throw error;
      }

      return (data ?? []).map(item => ({
        id: item.id,
        nombre: item.nombre,
        categoria: item.categoria ?? null,
        precio_venta_publico: item.precio_venta_publico ?? 0,
        stock_actual: item.stock_actual ?? 0,
        imagen_url: item.imagen_url ?? null,
      }));
    },
    { source: 'supabase', route: 'catalogo' }
  );

  return result;
}

export const getCatalogProducts = unstable_cache(loadCatalogProducts, ['catalogo-products-v1'], {
  revalidate: 300,
  tags: ['catalogo-products'],
});

export async function warmCriticalCaches() {
  const [catalogProducts] = await Promise.all([
    getCatalogProducts(),
  ]);

  return {
    catalogProducts: catalogProducts.length,
  };
}
