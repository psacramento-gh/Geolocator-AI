import { gateway } from 'ai'
import { humanizeModelId, resolveCapabilities } from './capabilities'
import {
  getEnabledRegistryModels,
  getModelDefinition,
  MODEL_REGISTRY,
  providerLabel,
  splitModelId,
} from './registry'
import type { ModelDefinition } from './types'

export type DiscoveryStatus = {
  source: 'live' | 'fallback'
  error?: string
  fetchedAt?: string
}

export type DiscoverModelsResult = {
  models: ModelDefinition[]
  status: DiscoveryStatus
  /** Models grouped by Gateway provider prefix for admin UI. */
  providers: Array<{
    id: string
    label: string
    source: 'live' | 'fallback'
    error?: string
  }>
}

type CacheEntry = {
  result: DiscoverModelsResult
  expiresAt: number
}

const CACHE_TTL_MS = 10 * 60 * 1000
let cache: CacheEntry | null = null

type GatewayListedModel = {
  id: string
  name?: string
  description?: string | null
  tags?: string[]
  modelType?: string | null
}

function allowlistSet(): Set<string> {
  return new Set(getEnabledRegistryModels().map((m) => m.id))
}

function isVisionCapable(model: GatewayListedModel): boolean {
  const tags = (model.tags || []).map((t) => t.toLowerCase())
  if (tags.includes('vision')) return true
  // Some listings omit tags; fall back to registry knowledge / id heuristics.
  if (getModelDefinition(model.id)?.capabilities.vision) return true
  const id = model.id.toLowerCase()
  if (/(embedding|tts|whisper|rerank|moderation|coder(?!-)|image-preview$)/i.test(id)) {
    return false
  }
  return false
}

function toDefinition(model: GatewayListedModel): ModelDefinition {
  const known = getModelDefinition(model.id)
  const tags = (model.tags || []).map((t) => t.toLowerCase())
  return {
    id: model.id,
    label: known?.label || model.name || humanizeModelId(model.id),
    enabled: known?.enabled ?? true,
    capabilities: resolveCapabilities(model.id, {
      vision: true,
      reasoning: tags.includes('reasoning') || known?.capabilities.reasoning,
      structuredOutput:
        tags.includes('structured-output') || known?.capabilities.structuredOutput !== false,
    }),
  }
}

function fallbackResult(error?: string): DiscoverModelsResult {
  const models = getEnabledRegistryModels()
  const providerIds = [...new Set(models.map((m) => splitModelId(m.id).provider))]
  return {
    models,
    status: {
      source: 'fallback',
      error,
      fetchedAt: new Date().toISOString(),
    },
    providers: providerIds.map((id) => ({
      id,
      label: providerLabel(id),
      source: 'fallback',
      error,
    })),
  }
}

async function fetchGatewayModels(): Promise<GatewayListedModel[]> {
  // Prefer SDK helper (authenticated when credentials present).
  try {
    const listed = await gateway.getAvailableModels()
    return (listed.models || []).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      modelType: m.modelType,
      // Tags may appear on extended responses; keep empty when absent.
      tags: (m as { tags?: string[] }).tags,
    }))
  } catch {
    // Public catalogue fallback (no auth required).
    const res = await fetch('https://ai-gateway.vercel.sh/v1/models', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
    })
    if (!res.ok) {
      throw new Error(`Gateway model list failed (${res.status})`)
    }
    const json = (await res.json()) as {
      data?: Array<{
        id: string
        name?: string
        description?: string
        tags?: string[]
        type?: string
      }>
    }
    return (json.data || []).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      tags: m.tags,
      modelType: m.type,
    }))
  }
}

/**
 * Gateway available models → vision-capable → GeoLocator allowlist → admin selector.
 * Results are cached briefly to avoid hammering the catalogue on every page load.
 */
export async function discoverModels(options?: { force?: boolean }): Promise<DiscoverModelsResult> {
  if (!options?.force && cache && cache.expiresAt > Date.now()) {
    return cache.result
  }

  try {
    const listed = await fetchGatewayModels()
    const allow = allowlistSet()

    const visionModels = listed
      .filter((m) => m.id.includes('/'))
      .filter(isVisionCapable)
      .filter((m) => allow.has(m.id) || getModelDefinition(m.id)?.enabled)

    // Prefer allowlisted models that appear in live catalogue; include enabled
    // registry models missing from live list so production selection still works.
    const byId = new Map<string, ModelDefinition>()
    for (const m of visionModels) {
      if (allow.has(m.id)) byId.set(m.id, toDefinition(m))
    }
    for (const reg of getEnabledRegistryModels()) {
      if (!byId.has(reg.id)) {
        // Keep curated entry even if live catalogue omitted it (preview churn).
        const live = listed.find((l) => l.id === reg.id)
        byId.set(reg.id, live ? toDefinition(live) : reg)
      }
    }

    const models = [...byId.values()].sort((a, b) => {
      const pa = splitModelId(a.id).provider
      const pb = splitModelId(b.id).provider
      if (pa !== pb) return pa.localeCompare(pb)
      return a.label.localeCompare(b.label)
    })

    if (!models.length) {
      const fallback = fallbackResult('Gateway returned no matching vision models')
      cache = { result: fallback, expiresAt: Date.now() + CACHE_TTL_MS }
      return fallback
    }

    const providerIds = [...new Set(models.map((m) => splitModelId(m.id).provider))]
    const result: DiscoverModelsResult = {
      models,
      status: {
        source: 'live',
        fetchedAt: new Date().toISOString(),
      },
      providers: providerIds.map((id) => ({
        id,
        label: providerLabel(id),
        source: 'live',
      })),
    }
    cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const fallback = fallbackResult(message)
    cache = { result: fallback, expiresAt: Date.now() + Math.min(CACHE_TTL_MS, 60_000) }
    return fallback
  }
}

/** Ensure a model id is present in discovery results (e.g. active production model). */
export function ensureModelInList(models: ModelDefinition[], modelId: string): ModelDefinition[] {
  if (!modelId || models.some((m) => m.id === modelId)) return models
  const known = getModelDefinition(modelId)
  return [
    {
      id: modelId,
      label: known?.label || humanizeModelId(modelId),
      enabled: true,
      capabilities: known?.capabilities || resolveCapabilities(modelId),
    },
    ...models,
  ]
}

export { MODEL_REGISTRY }
