import { NextRequest, NextResponse } from 'next/server'
import { getProductionModelConfig, runModel, toPublicLocations, ProviderError } from '@/lib/ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json()

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Missing image or mimeType' }, { status: 400 })
    }

    // Snapshot config once at request start so in-flight work is not mixed.
    const config = await getProductionModelConfig()

    const result = await runModel({
      config,
      imageBase64: image,
      mimeType,
      source: 'production',
    })

    return NextResponse.json({ locations: toPublicLocations(result.output) })
  } catch (err: unknown) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
    }
    console.error('[analyze]', err instanceof Error ? err.message : 'Analysis failed')
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
