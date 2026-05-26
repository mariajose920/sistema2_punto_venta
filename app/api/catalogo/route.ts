import { NextResponse } from 'next/server';
import { getCatalogProducts } from '@/lib/cache-queries';
import { logPerf } from '@/lib/perf';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const start = performance.now();
  const products = await getCatalogProducts();
  const duration = performance.now() - start;

  logPerf('[API] catalogo', duration, { count: products.length });

  return NextResponse.json(
    {
      products,
      meta: {
        durationMs: Number(duration.toFixed(2)),
        generatedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    }
  );
}
