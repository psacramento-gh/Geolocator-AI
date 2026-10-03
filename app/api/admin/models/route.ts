import { NextResponse } from 'next/server'
import { discoverModels, getProductionModelConfig } from '@/lib/ai'
import { requireAdminApi } from '@/lib/auth/admin'

export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const [production, discovered] = await Promise.all([
      getProductionModelConfig(),
      discoverModels(),
    ])
    return NextResponse.json({
      models: discovered.models,
      providers: discovered.providers,
      defaultPrompt: production.prompt,
      defaultSettings: {
        temperature: production.temperature,
        maxOutputTokens: production.maxOutputTokens,
        reasoningLevel: production.reasoningLevel,
        imageQuality: production.imageQuality,
        responseFormat: production.responseFormat,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load models'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
