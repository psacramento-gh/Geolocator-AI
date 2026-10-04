import { afterEach, describe, expect, it } from 'vitest'
import {
  GATE_PASS_TTL_MS,
  issueGatePass,
  shouldProceedAfterGate,
  verifyGatePass,
} from './pass-token'

describe('gate pass token', () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET
    delete process.env.IMAGE_GATE_PASS_SECRET
  })

  it('issues and verifies a pass bound to content hash', () => {
    process.env.ADMIN_SECRET = 'test-secret'
    const token = issueGatePass({
      requestId: 'req-1',
      contentHash: 'abc123',
      status: 'accepted',
      now: 1_000_000,
    })
    expect(token).toBeTruthy()
    const payload = verifyGatePass(token, {
      expectedContentHash: 'abc123',
      now: 1_000_000,
    })
    expect(payload?.requestId).toBe('req-1')
    expect(payload?.status).toBe('accepted')
  })

  it('rejects expired passes', () => {
    process.env.ADMIN_SECRET = 'test-secret'
    const now = 1_000_000
    const token = issueGatePass({
      requestId: 'req-1',
      contentHash: 'abc123',
      status: 'accepted',
      now,
    })
    expect(
      verifyGatePass(token, { now: now + GATE_PASS_TTL_MS + 1, expectedContentHash: 'abc123' })
    ).toBeNull()
  })

  it('rejects tampered tokens and hash mismatches', () => {
    process.env.ADMIN_SECRET = 'test-secret'
    const token = issueGatePass({
      requestId: 'req-1',
      contentHash: 'abc123',
      status: 'accepted',
    })
    expect(verifyGatePass(token + 'x')).toBeNull()
    expect(verifyGatePass(token, { expectedContentHash: 'other' })).toBeNull()
  })

  it('returns null when no signing secret is configured', () => {
    expect(
      issueGatePass({ requestId: 'r', contentHash: 'h', status: 'accepted' })
    ).toBeNull()
  })
})

describe('shouldProceedAfterGate', () => {
  it('always proceeds on accepted', () => {
    expect(shouldProceedAfterGate('accepted', false)).toBe(true)
    expect(shouldProceedAfterGate('accepted', true)).toBe(true)
  })

  it('never proceeds on rejected', () => {
    expect(shouldProceedAfterGate('rejected', true)).toBe(false)
  })

  it('honors fail-open for gate_error', () => {
    expect(shouldProceedAfterGate('gate_error', true)).toBe(true)
    expect(shouldProceedAfterGate('gate_error', false)).toBe(false)
  })
})
