import { createHmac, timingSafeEqual } from 'crypto'
import type { ImageGateStatus } from './types'

/** How long a pre-checkout gate pass remains valid through Lightning payment. */
export const GATE_PASS_TTL_MS = 2 * 60 * 60 * 1000

export type GatePassPayload = {
  v: 1
  requestId: string
  contentHash: string
  /** Only proceeds that were allowed at issue time. */
  status: 'accepted' | 'gate_error'
  issuedAt: number
  exp: number
}

function passSecret(): string | null {
  const dedicated = process.env.IMAGE_GATE_PASS_SECRET?.trim()
  if (dedicated) return dedicated
  const admin = process.env.ADMIN_SECRET?.trim()
  if (admin) return admin
  return null
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64url')
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/**
 * Issue a signed gate pass so /api/analyze can reuse the pre-checkout decision
 * without re-running the nondeterministic semantic gate after payment.
 */
export function issueGatePass(args: {
  requestId: string
  contentHash: string
  status: 'accepted' | 'gate_error'
  now?: number
}): string | null {
  const secret = passSecret()
  if (!secret || !args.contentHash) return null

  const now = args.now ?? Date.now()
  const payload: GatePassPayload = {
    v: 1,
    requestId: args.requestId,
    contentHash: args.contentHash,
    status: args.status,
    issuedAt: now,
    exp: now + GATE_PASS_TTL_MS,
  }
  const body = b64url(JSON.stringify(payload))
  const sig = sign(body, secret)
  return `${body}.${sig}`
}

export function verifyGatePass(
  token: unknown,
  opts?: { now?: number; expectedContentHash?: string }
): GatePassPayload | null {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const secret = passSecret()
  if (!secret) return null

  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null

  const expected = sign(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: GatePassPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GatePassPayload
  } catch {
    return null
  }

  if (payload.v !== 1) return null
  if (payload.status !== 'accepted' && payload.status !== 'gate_error') return null
  if (typeof payload.contentHash !== 'string' || !payload.contentHash) return null
  if (typeof payload.requestId !== 'string' || !payload.requestId) return null
  if (typeof payload.exp !== 'number' || typeof payload.issuedAt !== 'number') return null

  const now = opts?.now ?? Date.now()
  if (now > payload.exp) return null

  if (opts?.expectedContentHash && opts.expectedContentHash !== payload.contentHash) {
    return null
  }

  return payload
}

/** Whether a gate outcome should continue to checkout / geolocation. */
export function shouldProceedAfterGate(status: ImageGateStatus, failOpen: boolean): boolean {
  if (status === 'accepted') return true
  if (status === 'rejected') return false
  return failOpen
}
