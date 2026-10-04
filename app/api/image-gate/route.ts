import { NextRequest, NextResponse } from 'next/server'
import { isImageGateFailOpen } from '@/lib/ai/config'
import {
  issueGatePass,
  runImageGate,
  shouldProceedAfterGate,
  type GpsExif,
} from '@/lib/image-gate'

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
  const failOpen = isImageGateFailOpen()

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

    const proceed = shouldProceedAfterGate(outcome.status, failOpen)

    let gatePass: string | null = null
    if (
      proceed &&
      outcome.contentHash &&
      (outcome.status === 'accepted' || outcome.status === 'gate_error')
    ) {
      gatePass = issueGatePass({
        requestId: outcome.requestId,
        contentHash: outcome.contentHash,
        status: outcome.status,
      })
    }

    const statusCode =
      outcome.status === 'rejected' ? 400 : !proceed && outcome.status === 'gate_error' ? 503 : 200

    return NextResponse.json(
      {
        status: outcome.status,
        requestId: outcome.requestId,
        gpsExifPresent: outcome.gpsExifPresent,
        gpsExif: outcome.gpsExif,
        userMessage: outcome.userMessage,
        rejectionReason: outcome.rejectionReason,
        accepted: proceed,
        gatePass,
      },
      { status: statusCode }
    )
  } catch (err) {
    console.error('[image-gate]', err instanceof Error ? err.message : 'Gate failed')
    // Never claim the image is unsuitable on infrastructure failure.
    if (failOpen) {
      return NextResponse.json({
        status: 'gate_error',
        accepted: true,
        requestId: null,
        gpsExifPresent: false,
        userMessage: null,
        rejectionReason: null,
        gatePass: null,
      })
    }
    return NextResponse.json(
      {
        status: 'gate_error',
        accepted: false,
        requestId: null,
        gpsExifPresent: false,
        userMessage: {
          title: 'Gate unavailable',
          body: 'Photo checking is temporarily unavailable. Please try again shortly.',
        },
        rejectionReason: null,
        gatePass: null,
      },
      { status: 503 }
    )
  }
}
