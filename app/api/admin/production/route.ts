import { NextRequest, NextResponse } from 'next/server'
import {
  getProductionModelConfig,
  saveProductionModelConfig,
  resolveCapabilities,
  discoverModels,
  humanizeModelId,
  listProviders,
  getModelDefinition,
  type ProviderId,
  type ReasoningLevel,
  type ImageQuality,
  type ResponseFormat,
} from '@/lib/ai'
import { requireAdminApi } from '@/lib/auth/admin'

export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const [config, discovered] = await Promise.all([
      getProductionModelConfig(),
      discoverModels(),
    ])
    const capabilities = resolveCapabilities(config.provider, config.model)
    const providerOrder = listProviders()

    return NextResponse.json({
      config,
      capabilities,
      providers: providerOrder.map((id) => {
        const status = discovered.providers.find((p) => p.id === id)
        const models = discovered.models
          .filter((m) => m.provider === id)
          .map((m) => ({
            id: m.id,
            label: m.label,
            capabilities: m.capabilities,
          }))

        // Keep the active production model selectable even if discovery omitted it.
        if (
          config.provider === id &&
          config.model &&
          !models.some((m) => m.id === config.model)
        ) {
          const known = getModelDefinition(config.provider, config.model)
          models.unshift({
            id: config.model,
            label: known?.label || humanizeModelId(config.model),
            capabilities: resolveCapabilities(config.provider, config.model),
          })
        }

        return {
          id,
          label: status?.label || id,
          source: status?.source,
          error: status?.error,
          models,
        }
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load production config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const body = await req.json()
    const provider = body.provider as ProviderId
    const model = String(body.model || '')
    const prompt = String(body.prompt || '')

    if (!provider || !model || !prompt.trim()) {
      return NextResponse.json({ error: 'provider, model, and prompt are required' }, { status: 400 })
    }

    const config = await saveProductionModelConfig({
      provider,
      model,
      prompt,
      temperature: Number(body.temperature ?? 0.2),
      maxOutputTokens: Number(body.maxOutputTokens ?? 1200),
      reasoningLevel: (body.reasoningLevel || 'medium') as ReasoningLevel,
      imageQuality: (body.imageQuality || 'high') as ImageQuality,
      responseFormat: (body.responseFormat || 'structured_json') as ResponseFormat,
    })

    return NextResponse.json({ config })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save production config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
