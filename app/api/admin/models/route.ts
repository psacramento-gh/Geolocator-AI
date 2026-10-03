import { NextResponse } from 'next/server'
import {
  DEFAULT_GEOLOCATION_PROMPT,
  discoverModels,
  getProductionModelConfig,
} from '@/lib/ai'
import { requireAdminApi } from '@/lib/auth/admin'

const FALLBACK_SETTINGS = {
  temperature: 0.2,
  maxOutputTokens: 1200,
  reasoningLevel: 'medium' as const,
  imageQuality: 'high' as const,
  responseFormat: 'structured_json' as const,
}

export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const discovered = await discoverModels()

    let defaultPrompt = DEFAULT_GEOLOCATION_PROMPT
    let defaultSettings = FALLBACK_SETTINGS
    try {
      const production = await getProductionModelConfig()
      defaultPrompt = production.prompt
      defaultSettings = {
        temperature: production.temperature,
        maxOutputTokens: production.maxOutputTokens,
        reasoningLevel: production.reasoningLevel,
        imageQuality: production.imageQuality,
        responseFormat: production.responseFormat,
      }
    } catch {
      // Still return discovered models if production config / DB is unavailable.
    }

    return NextResponse.json({
      models: discovered.models,
      providers: discovered.providers,
      defaultPrompt,
      defaultSettings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load models'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
