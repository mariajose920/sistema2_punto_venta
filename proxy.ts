import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  // Mantener la lógica extremadamente rápida y mínima.
  // En Next.js 16, proxy corre bajo Node.js Runtime por defecto.
  const startMid = performance.now()
  const res = await updateSession(request)
  const endMid = performance.now()

  console.log(`[PERF_AUTH] [Proxy] Latencia en ruta protegida ${request.nextUrl.pathname}: ${(endMid - startMid).toFixed(2)}ms`)
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
