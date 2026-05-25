import { NextRequest, NextResponse } from 'next/server';
import { warmCriticalCaches } from '@/lib/cache-queries';
import { logPerf } from '@/lib/perf';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const expectedToken = process.env.CACHE_WARMUP_TOKEN;

  if (expectedToken && token !== expectedToken) {
    return NextResponse.json(
      { ok: false, message: 'Token inválido' },
      { status: 401 }
    );
  }

  const start = performance.now();
  const result = await warmCriticalCaches();
  const duration = performance.now() - start;

  logPerf('[API] cache-warmup', duration, { route: '/api/cache-warmup' });

  return NextResponse.json({
    ok: true,
    warmedAt: new Date().toISOString(),
    durationMs: Number(duration.toFixed(2)),
    result,
  });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-cache-warmup-token');
  const expectedToken = process.env.CACHE_WARMUP_TOKEN;

  if (expectedToken && token !== expectedToken) {
    return NextResponse.json(
      { ok: false, message: 'Token inválido' },
      { status: 401 }
    );
  }

  const start = performance.now();
  const result = await warmCriticalCaches();
  const duration = performance.now() - start;

  logPerf('[API] cache-warmup', duration, { route: '/api/cache-warmup', method: 'POST' });

  return NextResponse.json({
    ok: true,
    warmedAt: new Date().toISOString(),
    durationMs: Number(duration.toFixed(2)),
    result,
  });
}
