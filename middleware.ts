import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Optimización de rendimiento: Evitar ejecutar lógica de sesión en solicitudes de prefetch.
  // Next.js prefetcheará los links cuando el usuario pase el cursor sobre ellos.
  // Hacer llamadas de red de autenticación en prefetch deprime drásticamente el rendimiento.
  if (request.headers.get('x-middleware-prefetch')) {
    return NextResponse.next();
  }

  const startMid = performance.now()
  const res = await updateSession(request)
  const endMid = performance.now()

  console.log(`[PERF_AUTH] [Middleware] Latencia en ruta protegida ${request.nextUrl.pathname}: ${(endMid - startMid).toFixed(2)}ms`)
  return res
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/cajera/:path*',
    '/productos/:path*',
    '/clientes/:path*',
    '/pedidos/:path*',
    '/ventas/:path*',
    '/compras/:path*',
    '/reportes/:path*',
    '/usuarios/:path*',
    '/proveedores/:path*',
    '/promociones/:path*',
  ],
}
