import { NextRequest, NextResponse } from 'next/server'
import {
  getProductionModelConfig,
  analyzeLocation,
  toPublicLocations,
  GatewayError,
  publicFacingError,
  isImageGateFailOpen,
} from '@/lib/ai'
import {
  logImageGateEvent,
  rejectionCopyFor,
  runDeterministicChecks,
  runImageGate,
  shouldProceedAfterGate,
  verifyGatePass,
  type GpsExif,
} from '@/lib/image-gate'

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
    const gatePassToken = body.gatePass as string | undefined

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Missing image or mimeType' }, { status: 400 })
    }

    const failOpen = isImageGateFailOpen()

    // Prefer reusing a signed pre-analyze decision so users are not
    // re-subjected to a nondeterministic semantic re-evaluation.
    let reusedRequestId: string | null = null
    let gpsExifPresent = Boolean(gpsExif)
    let resolvedGps = gpsExif || undefined

    const det = runDeterministicChecks({ imageBase64: image, mimeType })
    if (!det.ok) {
      const copy = rejectionCopyFor(det.rejectionReason)
      return NextResponse.json(
        {
          error: copy.body,
          title: copy.title,
          code: 'IMAGE_REJECTED',
          rejectionReason: det.rejectionReason,
          gpsExifPresent,
          gpsExif: resolvedGps,
        },
        { status: 400 }
      )
    }

    const pass = verifyGatePass(gatePassToken, { expectedContentHash: det.contentHash })
    if (pass) {
      reusedRequestId = pass.requestId
      await logImageGateEvent({
        requestId: pass.requestId,
        model: 'gate-pass-reuse',
        status: pass.status === 'gate_error' ? 'gate_error' : 'accepted',
        result: null,
        latencyMs: 0,
        gateError: pass.status === 'gate_error' ? 'reused_pre_analyze_pass' : null,
        gpsExifPresent,
        gpsExif: resolvedGps,
        contentHash: det.contentHash,
        phase: 'analyze',
      })
    } else {
      // No valid pass (direct caller or expired) — run the full unified gate.
      const gate = await runImageGate({
        imageBase64: image,
        mimeType,
        phase: 'analyze',
        gpsExif,
        skipDuplicateCheck: true,
      })

      gpsExifPresent = gate.gpsExifPresent
      resolvedGps = gate.gpsExif

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

      if (!shouldProceedAfterGate(gate.status, failOpen)) {
        const copy = gate.userMessage
        return NextResponse.json(
          {
            error: copy?.body || 'Photo checking is temporarily unavailable. Please try again shortly.',
            title: copy?.title || 'Gate unavailable',
            code: 'GATE_UNAVAILABLE',
          },
          { status: 503 }
        )
      }

      reusedRequestId = gate.requestId
    }

    // Snapshot config once at request start so in-flight work is not mixed.
    const config = await getProductionModelConfig()

    const result = await analyzeLocation({
      config,
      imageBase64: image,
      mimeType,
      mode: 'production',
      requestId: reusedRequestId || undefined,
    })

    return NextResponse.json({
      locations: toPublicLocations(result.result),
      gpsExifPresent,
      gpsExif: resolvedGps,
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
