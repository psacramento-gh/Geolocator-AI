import { createHash } from 'crypto'
import { imageSize } from 'image-size'
import { and, eq, gte } from 'drizzle-orm'
import { getReadyDb } from '@/lib/db'
import { imageGateHashes } from '@/lib/db/schema'
import type { ImageGateRejectionReason } from './types'

export const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

/** Align with playground payload guard / Vercel body limits. */
export const MAX_BASE64_LENGTH = 3_500_000

/** Minimum width and height for geolocation-suitable photos. */
export const MIN_DIMENSION_PX = 200

/** Exact-hash duplicate window. */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000

export type DeterministicCheckOk = {
  ok: true
  buffer: Buffer
  contentHash: string
  width: number
  height: number
  mimeType: string
}

export type DeterministicCheckFail = {
  ok: false
  rejectionReason: NonNullable<ImageGateRejectionReason>
  contentHash: string | null
  message: string
}

export type DeterministicCheckResult = DeterministicCheckOk | DeterministicCheckFail

function normalizeMime(mimeType: string): string {
  const lower = (mimeType || '').toLowerCase().split(';')[0].trim()
  if (lower === 'image/jpg') return 'image/jpeg'
  return lower
}

export function hashImageBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Cheap deterministic validation before calling the semantic gate model.
 */
export function runDeterministicChecks(args: {
  imageBase64: string
  mimeType: string
}): DeterministicCheckResult {
  const mimeType = normalizeMime(args.mimeType)

  if (!args.imageBase64 || typeof args.imageBase64 !== 'string') {
    return {
      ok: false,
      rejectionReason: 'corrupt_image',
      contentHash: null,
      message: 'Missing image data',
    }
  }

  if (args.imageBase64.length > MAX_BASE64_LENGTH) {
    return {
      ok: false,
      rejectionReason: 'file_too_large',
      contentHash: null,
      message: 'Image payload exceeds size limit',
    }
  }

  if (!SUPPORTED_MIME_TYPES.has(mimeType) && mimeType !== 'image/jpg') {
    return {
      ok: false,
      rejectionReason: 'unsupported_format',
      contentHash: null,
      message: `Unsupported image type: ${mimeType || 'unknown'}`,
    }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(args.imageBase64, 'base64')
  } catch {
    return {
      ok: false,
      rejectionReason: 'corrupt_image',
      contentHash: null,
      message: 'Invalid base64 image data',
    }
  }

  if (!buffer.length) {
    return {
      ok: false,
      rejectionReason: 'corrupt_image',
      contentHash: null,
      message: 'Empty image buffer',
    }
  }

  const contentHash = hashImageBuffer(buffer)

  let width = 0
  let height = 0
  try {
    const dims = imageSize(buffer)
    width = dims.width ?? 0
    height = dims.height ?? 0
  } catch {
    return {
      ok: false,
      rejectionReason: 'corrupt_image',
      contentHash,
      message: 'Unable to decode image dimensions',
    }
  }

  if (!width || !height) {
    return {
      ok: false,
      rejectionReason: 'corrupt_image',
      contentHash,
      message: 'Unable to determine image dimensions',
    }
  }

  if (width < MIN_DIMENSION_PX || height < MIN_DIMENSION_PX) {
    return {
      ok: false,
      rejectionReason: 'dimensions_too_small',
      contentHash,
      message: `Image dimensions ${width}x${height} below minimum ${MIN_DIMENSION_PX}px`,
    }
  }

  return {
    ok: true,
    buffer,
    contentHash,
    width,
    height,
    mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
  }
}

/** Returns true if this content hash was seen within the duplicate window. */
export async function isDuplicateContentHash(contentHash: string): Promise<boolean> {
  try {
    const db = await getReadyDb()
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS)
    const rows = await db
      .select({ id: imageGateHashes.id })
      .from(imageGateHashes)
      .where(and(eq(imageGateHashes.contentHash, contentHash), gte(imageGateHashes.createdAt, since)))
      .limit(1)
    return rows.length > 0
  } catch (err) {
    // Fail open on DB issues — do not block uploads.
    console.error(
      '[image_gate] duplicate check failed',
      err instanceof Error ? err.message : String(err)
    )
    return false
  }
}

/** Record a content hash after a successful (non-reject-as-duplicate) gate pass attempt. */
export async function recordContentHash(contentHash: string): Promise<void> {
  try {
    const db = await getReadyDb()
    await db.insert(imageGateHashes).values({ contentHash })
  } catch (err) {
    console.error(
      '[image_gate] failed to record content hash',
      err instanceof Error ? err.message : String(err)
    )
  }
}
