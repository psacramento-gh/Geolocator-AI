import { NextRequest, NextResponse } from 'next/server'
import {
  getProductionModelConfig,
  saveProductionModelConfig,
  getModelDefinition,
  listProviders,
  getModelsByProvider,
  providerLabel,
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
    const config = await getProductionModelConfig()
    const definition = getModelDefinition(config.provider, config.model)
    return NextResponse.json({
      config,
      capabilities: definition?.capabilities ?? {
        temperature: true,
        maxOutputTokens: true,
        reasoning: false,
        imageQuality: false,
        structuredOutput: true,
      },
      providers: listProviders().map((id) => ({
        id,
        label: providerLabel(id),
        models: getModelsByProvider(id).map((m) => ({
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
