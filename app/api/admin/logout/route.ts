import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminCookieOptions } from '@/lib/auth/admin'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', adminCookieOptions(0))
  return res
}
