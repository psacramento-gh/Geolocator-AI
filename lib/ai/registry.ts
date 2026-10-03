import type { ModelCapabilities, ModelDefinition } from './types'

const VISION_STRUCTURED: ModelCapabilities = {
  vision: true,
  temperature: true,
  maxOutputTokens: true,
  reasoning: false,
  imageQuality: false,
  structuredOutput: true,
}

/**
 * Curated allowlist of Gateway vision models suitable for GeoLocator.
 * Discovery filters Gateway catalogue down to these (or enabled registry entries).
 */
export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'google/gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED },
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED },
  },
  {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED, reasoning: true },
  },
  {
    id: 'google/gemini-3-flash',
    label: 'Gemini 3 Flash',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED, reasoning: true },
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED, imageQuality: true },
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED, imageQuality: true },
  },
  {
    id: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    enabled: true,
    capabilities: {
      vision: true,
      temperature: false,
      maxOutputTokens: true,
      reasoning: true,
      imageQuality: true,
      structuredOutput: true,
    },
  },
  {
    id: 'openai/o4-mini',
    label: 'o4 Mini',
    enabled: true,
    capabilities: {
      vision: true,
      temperature: false,
      maxOutputTokens: true,
      reasoning: true,
      imageQuality: true,
      structuredOutput: true,
    },
  },
  {
    id: 'alibaba/qwen3-vl-instruct',
    label: 'Qwen3 VL Instruct',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED },
  },
  {
    id: 'alibaba/qwen3-vl-thinking',
    label: 'Qwen3 VL Thinking',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED, reasoning: true },
  },
  {
    id: 'alibaba/qwen3-vl-235b-a22b-instruct',
    label: 'Qwen3 VL 235B Instruct',
    enabled: true,
    capabilities: { ...VISION_STRUCTURED },
  },
]

export const DEFAULT_PRODUCTION_MODEL_ID = 'google/gemini-3.1-flash-lite'

/** Default models pre-selected in playground / benchmarks when available. */
export const DEFAULT_COMPARE_MODEL_IDS = [
  'google/gemini-3.1-flash-lite',
  'openai/gpt-4o-mini',
  'alibaba/qwen3-vl-instruct',
] as const

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId)
}

export function getEnabledRegistryModels(): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.enabled)
}

/** Parse Gateway `provider/model` id into parts. */
export function splitModelId(modelId: string): { provider: string; model: string } {
  const slash = modelId.indexOf('/')
  if (slash <= 0) return { provider: 'unknown', model: modelId }
  return {
    provider: modelId.slice(0, slash),
    model: modelId.slice(slash + 1),
  }
}

/**
 * Map legacy adapter provider+model pairs to Gateway model ids.
 */
export function toGatewayModelId(provider: string | null | undefined, model: string | null | undefined): string {
  if (!model) return DEFAULT_PRODUCTION_MODEL_ID
  if (model.includes('/')) return model

  const p = (provider || '').toLowerCase()
  if (p === 'gemini' || p === 'google') {
    // Legacy preview slug → Gateway id
    if (model === 'gemini-3.1-flash-lite-preview') return 'google/gemini-3.1-flash-lite'
    return `google/${model}`
  }
  if (p === 'openai') return `openai/${model}`
  if (p === 'qwen' || p === 'alibaba') {
    if (model === 'qwen-vl-max' || model === 'qwen-vl-plus') return 'alibaba/qwen3-vl-instruct'
    if (model === 'qwen3-vl-plus') return 'alibaba/qwen3-vl-instruct'
    return `alibaba/${model}`
  }
  return model.includes('/') ? model : `${p || 'unknown'}/${model}`
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case 'google':
      return 'Google'
    case 'openai':
      return 'OpenAI'
    case 'alibaba':
      return 'Alibaba / Qwen'
    case 'anthropic':
      return 'Anthropic'
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
}
