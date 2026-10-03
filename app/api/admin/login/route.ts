import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminSessionToken,
  getClientIp,
  isLoginRateLimited,
  recordLoginAttempt,
  verifyAdminSecret,
} from '@/lib/auth/admin'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  if (isLoginRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many login attempts. Try again shortly.' }, { status: 429 })
  }

  recordLoginAttempt(ip)

  let secret: string | undefined
  try {
    const body = await req.json()
    secret = typeof body.secret === 'string' ? body.secret : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Admin authentication is not configured' }, { status: 503 })
  }

  if (!secret || !verifyAdminSecret(secret)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await createAdminSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions())
  return res
}
