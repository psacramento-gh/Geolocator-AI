import OpenAI from 'openai'
import { humanizeModelId, resolveCapabilities } from './capabilities'
import { MODEL_REGISTRY, listProviders, providerLabel } from './registry'
import type { ModelDefinition, ProviderId } from './types'

export type ProviderDiscoveryStatus = {
  id: ProviderId
  label: string
  source: 'live' | 'fallback'
  error?: string
}

export type DiscoverModelsResult = {
  models: ModelDefinition[]
  providers: ProviderDiscoveryStatus[]
}

type GeminiListModel = {
  name?: string
  displayName?: string
  description?: string
  supportedGenerationMethods?: string[]
  thinking?: boolean
}

function fallbackModels(provider: ProviderId): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider)
}

function toDefinition(
  provider: ProviderId,
  id: string,
  label?: string,
  hints?: Parameters<typeof resolveCapabilities>[2]
): ModelDefinition {
  const known = MODEL_REGISTRY.find((m) => m.provider === provider && m.id === id)
  return {
    id,
    provider,
    label: known?.label || label || humanizeModelId(id),
    capabilities: resolveCapabilities(provider, id, hints),
  }
}

function isGeminiVisionModel(model: GeminiListModel): boolean {
  const id = (model.name || '').replace(/^models\//, '').toLowerCase()
  if (!id.includes('gemini')) return false
  if (!model.supportedGenerationMethods?.includes('generateContent')) return false
  if (/(embedding|imagen|aqa|tts|robotics|gemma)/i.test(id)) return false
  return true
}

async function listGeminiModels(): Promise<ModelDefinition[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('API key not configured')

  const models: ModelDefinition[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Gemini list models failed (${res.status}): ${body.slice(0, 200)}`)
    }

    const json = (await res.json()) as {
      models?: GeminiListModel[]
      nextPageToken?: string
    }

    for (const model of json.models || []) {
      if (!isGeminiVisionModel(model)) continue
      const id = (model.name || '').replace(/^models\//, '')
      if (!id) continue
      models.push(
        toDefinition('gemini', id, model.displayName, {
          reasoning: Boolean(model.thinking),
        })
      )
    }

    pageToken = json.nextPageToken
  } while (pageToken)

  return models.sort((a, b) => a.label.localeCompare(b.label))
}

function isOpenAiVisionModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (
    /(realtime|audio|transcribe|tts|whisper|dall-e|embedding|moderation|babbage|davinci|instruct|search|image-1|codex|computer-use)/i.test(
      lower
    )
  ) {
    return false
  }
  return (
    /^gpt-4o/.test(lower) ||
    /^gpt-4\.1/.test(lower) ||
    /^gpt-4-turbo/.test(lower) ||
    /^gpt-4-vision/.test(lower) ||
    /^chatgpt-4o/.test(lower) ||
    /^gpt-5/.test(lower) ||
    /^o[1-9]/.test(lower)
  )
}

async function listOpenAiModels(): Promise<ModelDefinition[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('API key not configured')

  const client = new OpenAI({ apiKey })
  const listed = await client.models.list()
  const models: ModelDefinition[] = []

  for await (const model of listed) {
    if (!isOpenAiVisionModel(model.id)) continue
    models.push(toDefinition('openai', model.id))
  }

  return models.sort((a, b) => a.label.localeCompare(b.label))
}

function isQwenVisionModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (!lower.includes('vl')) return false
  if (/(embedding|tts|asr|audio|rerank)/i.test(lower)) return false
  return true
}

async function listQwenModels(): Promise<ModelDefinition[]> {
  const apiKey = process.env.QWEN_API_KEY
  if (!apiKey) throw new Error('API key not configured')

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  })
  const listed = await client.models.list()
  const models: ModelDefinition[] = []

  for await (const model of listed) {
    if (!isQwenVisionModel(model.id)) continue
    models.push(toDefinition('qwen', model.id))
  }

  return models.sort((a, b) => a.label.localeCompare(b.label))
}

const listers: Record<ProviderId, () => Promise<ModelDefinition[]>> = {
  gemini: listGeminiModels,
  openai: listOpenAiModels,
  qwen: listQwenModels,
}

async function discoverProvider(provider: ProviderId): Promise<{
  models: ModelDefinition[]
  status: ProviderDiscoveryStatus
}> {
  try {
    const models = await listers[provider]()
    if (!models.length) {
      return {
        models: fallbackModels(provider),
        status: {
          id: provider,
          label: providerLabel(provider),
          source: 'fallback',
          error: 'Provider returned no vision models',
        },
      }
    }
    return {
      models,
      status: {
        id: provider,
        label: providerLabel(provider),
        source: 'live',
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      models: fallbackModels(provider),
      status: {
        id: provider,
        label: providerLabel(provider),
        source: 'fallback',
        error: message,
      },
    }
  }
}

/** Fetch vision models from each provider, falling back to the curated registry on failure. */
export async function discoverModels(): Promise<DiscoverModelsResult> {
  const results = await Promise.all(listProviders().map((id) => discoverProvider(id)))
  const models = results.flatMap((r) => r.models)
  const providers = results.map((r) => r.status)

  // Stable provider order, then label within provider.
  const order = listProviders()
  models.sort((a, b) => {
    const pa = order.indexOf(a.provider)
    const pb = order.indexOf(b.provider)
    if (pa !== pb) return pa - pb
    return a.label.localeCompare(b.label)
  })

  return { models, providers }
}
