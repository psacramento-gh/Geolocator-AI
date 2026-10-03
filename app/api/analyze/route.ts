import { NextRequest, NextResponse } from 'next/server'
import {
  getProductionModelConfig,
  analyzeLocation,
  toPublicLocations,
  GatewayError,
  publicFacingError,
} from '@/lib/ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json()

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Missing image or mimeType' }, { status: 400 })
    }

    // Snapshot config once at request start so in-flight work is not mixed.
    const config = await getProductionModelConfig()

    const result = await analyzeLocation({
      config,
      imageBase64: image,
      mimeType,
      mode: 'production',
    })

    return NextResponse.json({ locations: toPublicLocations(result.result) })
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
