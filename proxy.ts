import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifyAdminSessionToken } from '@/lib/auth/admin-edge'

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi = pathname.startsWith('/api/admin')
  const isLoginPage = pathname === '/admin/login'
  const isLoginApi = pathname === '/api/admin/login'

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next()
  }

  if (isLoginPage || isLoginApi) {
    return NextResponse.next()
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value
  const ok = token ? await verifyAdminSessionToken(token) : false

  if (!ok) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/admin/login'
    // Only forward local /admin paths (never absolute or protocol-relative URLs).
    if (pathname.startsWith('/admin') && !pathname.startsWith('//')) {
      url.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
