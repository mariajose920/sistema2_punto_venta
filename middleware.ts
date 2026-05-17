import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
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