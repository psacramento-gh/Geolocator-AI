import { NextResponse } from 'next/server'
import { MODEL_REGISTRY, listProviders, providerLabel, getProductionModelConfig } from '@/lib/ai'
import { requireAdminApi } from '@/lib/auth/admin'

export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const production = await getProductionModelConfig()
    return NextResponse.json({
      models: MODEL_REGISTRY,
      providers: listProviders().map((id) => ({ id, label: providerLabel(id) })),
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
