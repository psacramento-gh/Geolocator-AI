import { NextRequest, NextResponse } from 'next/server'
import {
  getProductionModelConfig,
  saveProductionModelConfig,
  resolveCapabilities,
  discoverModels,
  ensureModelInList,
  type ReasoningLevel,
  type ImageQuality,
  type ResponseFormat,
} from '@/lib/ai'
import { requireAdminApi } from '@/lib/auth/admin'
import { splitModelId } from '@/lib/ai/registry'

export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const [config, discovered] = await Promise.all([
      getProductionModelConfig(),
      discoverModels(),
    ])
    const models = ensureModelInList(discovered.models, config.modelId)
    const capabilities = resolveCapabilities(config.modelId)

    return NextResponse.json({
      config,
      capabilities,
      models,
      discovery: discovered.status,
      providers: discovered.providers.map((p) => ({
        ...p,
        models: models
          .filter((m) => splitModelId(m.id).provider === p.id)
          .map((m) => ({
            id: m.id,
            label: m.label,
            capabilities: m.capabilities,
          })),
      })),
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
    const modelId = String(body.modelId || body.model || '')
    const prompt = String(body.prompt || '')

    if (!modelId || !prompt.trim()) {
      return NextResponse.json({ error: 'modelId and prompt are required' }, { status: 400 })
    }
    if (!modelId.includes('/')) {
      return NextResponse.json(
        { error: 'modelId must be a Gateway id in provider/model format' },
        { status: 400 }
      )
    }

    const config = await saveProductionModelConfig({
      modelId,
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
