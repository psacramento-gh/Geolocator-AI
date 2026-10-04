import { describe, expect, it } from 'vitest'
import {
  MAX_BASE64_LENGTH,
  MIN_DIMENSION_PX,
  runDeterministicChecks,
} from './deterministic'
import { makePngBuffer, toBase64 } from './test-helpers'

describe('runDeterministicChecks', () => {
  it('accepts a valid PNG meeting minimum dimensions', () => {
    const buf = makePngBuffer(MIN_DIMENSION_PX, MIN_DIMENSION_PX)
    const result = runDeterministicChecks({
      imageBase64: toBase64(buf),
      mimeType: 'image/png',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.width).toBe(MIN_DIMENSION_PX)
      expect(result.height).toBe(MIN_DIMENSION_PX)
      expect(result.contentHash).toHaveLength(64)
    }
  })

  it('rejects unsupported MIME types', () => {
    const buf = makePngBuffer(256, 256)
    const result = runDeterministicChecks({
      imageBase64: toBase64(buf),
      mimeType: 'image/tiff',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.rejectionReason).toBe('unsupported_format')
    }
  })

  it('rejects oversized base64 payloads', () => {
    const result = runDeterministicChecks({
      imageBase64: 'a'.repeat(MAX_BASE64_LENGTH + 1),
      mimeType: 'image/jpeg',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.rejectionReason).toBe('file_too_large')
    }
  })

  it('rejects dimensions below the minimum', () => {
    const buf = makePngBuffer(64, 64)
    const result = runDeterministicChecks({
      imageBase64: toBase64(buf),
      mimeType: 'image/png',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.rejectionReason).toBe('dimensions_too_small')
    }
  })

  it('rejects corrupt image data', () => {
    const result = runDeterministicChecks({
      imageBase64: Buffer.from('not-an-image').toString('base64'),
      mimeType: 'image/jpeg',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.rejectionReason).toBe('corrupt_image')
    }
  })

  it('normalizes image/jpg to image/jpeg', () => {
    const buf = makePngBuffer(220, 220)
    const result = runDeterministicChecks({
      imageBase64: toBase64(buf),
      mimeType: 'image/jpg',
    })
    // MIME allowlist accepts jpg; decode still works for PNG bytes with jpg mime
    // (we only validate dimensions via magic bytes, not MIME/content match).
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mimeType).toBe('image/jpeg')
    }
  })
})
