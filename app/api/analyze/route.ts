import { NextRequest, NextResponse } from 'next/server'
import {
  getProductionModelConfig,
  analyzeLocation,
  toPublicLocations,
  GatewayError,
  publicFacingError,
} from '@/lib/ai'
import { runImageGate, type GpsExif } from '@/lib/image-gate'

export const maxDuration = 60

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

    // Unified Image Gate before paid geolocation. Skip duplicate check — same
    // image was typically gated at pre-checkout moments earlier.
    const gate = await runImageGate({
      imageBase64: image,
      mimeType,
      phase: 'analyze',
      gpsExif,
      skipDuplicateCheck: true,
    })

    if (gate.status === 'rejected') {
      const copy = gate.userMessage
      return NextResponse.json(
        {
          error: copy?.body || 'This photo is not suitable for analysis.',
          title: copy?.title,
          code: 'IMAGE_REJECTED',
          rejectionReason: gate.rejectionReason,
          gpsExifPresent: gate.gpsExifPresent,
          gpsExif: gate.gpsExif,
        },
        { status: 400 }
      )
    }

    // Snapshot config once at request start so in-flight work is not mixed.
    const config = await getProductionModelConfig()

    const result = await analyzeLocation({
      config,
      imageBase64: image,
      mimeType,
      mode: 'production',
      requestId: gate.requestId,
    })

    return NextResponse.json({
      locations: toPublicLocations(result.result),
      gpsExifPresent: gate.gpsExifPresent,
      gpsExif: gate.gpsExif,
    })
  } catch (err: unknown) {
    if (err instanceof GatewayError) {
      const status =
        err.type === 'BUDGET_EXCEEDED' || err.type === 'RATE_LIMITED'
          ? 503
          : err.type === 'INVALID_IMAGE'
            ? 400
            : 500
      return NextResponse.json({ error: publicFacingError(err.type) }, { status })
    }
    console.error('[analyze]', err instanceof Error ? err.message : 'Analysis failed')
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
