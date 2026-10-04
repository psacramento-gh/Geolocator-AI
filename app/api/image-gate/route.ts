import { NextRequest, NextResponse } from 'next/server'
import { runImageGate, type GpsExif } from '@/lib/image-gate'

export const maxDuration = 30

function parseGpsExif(raw: unknown): GpsExif | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const latitude = Number(obj.latitude)
  const longitude = Number(obj.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const image = body.image as string | undefined
    const mimeType = body.mimeType as string | undefined
    const gpsExif = parseGpsExif(body.gpsExif)

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Missing image or mimeType' }, { status: 400 })
    }

    const outcome = await runImageGate({
      imageBase64: image,
      mimeType,
      phase: 'pre_checkout',
      gpsExif,
    })

    return NextResponse.json({
      status: outcome.status,
      requestId: outcome.requestId,
      gpsExifPresent: outcome.gpsExifPresent,
      gpsExif: outcome.gpsExif,
      userMessage: outcome.userMessage,
      rejectionReason: outcome.rejectionReason,
      // Lightweight fields for client logging / future UX — no model jargon required.
      accepted: outcome.status === 'accepted' || outcome.status === 'gate_error',
    })
  } catch (err) {
    console.error('[image-gate]', err instanceof Error ? err.message : 'Gate failed')
    // Fail open at the HTTP boundary too — never claim the image is unsuitable.
    return NextResponse.json({
      status: 'gate_error',
      accepted: true,
      requestId: null,
      gpsExifPresent: false,
      userMessage: null,
      rejectionReason: null,
    })
  }
}
