import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifyAdminSessionToken } from '@/lib/auth/admin-edge'

export { ADMIN_COOKIE, verifyAdminSessionToken }

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function getSecretBytes(): Uint8Array {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    throw new Error('ADMIN_SECRET is not set')
  }
  return new TextEncoder().encode(secret)
}

function hashSecret(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** Constant-time comparison of candidate against ADMIN_SECRET. */
export function verifyAdminSecret(candidate: string): boolean {
  const expected = process.env.ADMIN_SECRET
  if (!expected || !candidate) return false
  const a = hashSecret(candidate)
  const b = hashSecret(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function createAdminSessionToken(): Promise<string> {
  const secret = getSecretBytes()
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setJti(randomBytes(16).toString('hex'))
    .sign(secret)
}

export function adminCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    if (!process.env.ADMIN_SECRET) return false
    const jar = await cookies()
    const token = jar.get(ADMIN_COOKIE)?.value
    if (!token) return false
    return verifyAdminSessionToken(token)
  } catch {
    return false
  }
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated()
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** Simple in-memory sliding-window rate limiter for admin login. */
const loginAttempts = new Map<string, number[]>()

export function isLoginRateLimited(ip: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now()
  const window = (loginAttempts.get(ip) || []).filter((t) => now - t < windowMs)
  loginAttempts.set(ip, window)
  return window.length >= limit
}

export function recordLoginAttempt(ip: string) {
  const now = Date.now()
  const window = (loginAttempts.get(ip) || []).filter((t) => now - t < 60_000)
  window.push(now)
  loginAttempts.set(ip, window)
}
