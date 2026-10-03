import type { ModelDefinition, ProviderId } from './types'

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'gemini-3.1-flash-lite-preview',
    provider: 'gemini',
    label: 'Gemini 3.1 Flash Lite Preview',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: false,
      imageQuality: false,
      structuredOutput: true,
    },
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: false,
      imageQuality: false,
      structuredOutput: true,
    },
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    label: 'Gemini 2.5 Pro',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: true,
      imageQuality: false,
      structuredOutput: true,
    },
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    label: 'GPT-4o',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: false,
      imageQuality: true,
      structuredOutput: true,
    },
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    label: 'GPT-4o Mini',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: false,
      imageQuality: true,
      structuredOutput: true,
    },
  },
  {
    id: 'o4-mini',
    provider: 'openai',
    label: 'o4 Mini',
    capabilities: {
      temperature: false,
      maxOutputTokens: true,
      reasoning: true,
      imageQuality: true,
      structuredOutput: true,
    },
  },
  {
    id: 'qwen-vl-max',
    provider: 'qwen',
    label: 'Qwen VL Max',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: false,
      imageQuality: false,
      structuredOutput: true,
    },
  },
  {
    id: 'qwen-vl-plus',
    provider: 'qwen',
    label: 'Qwen VL Plus',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: false,
      imageQuality: false,
      structuredOutput: true,
    },
  },
  {
    id: 'qwen3-vl-plus',
    provider: 'qwen',
    label: 'Qwen3 VL Plus',
    capabilities: {
      temperature: true,
      maxOutputTokens: true,
      reasoning: true,
      imageQuality: false,
      structuredOutput: true,
    },
  },
]

export function getModelsByProvider(provider: ProviderId): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider)
}

export function getModelDefinition(provider: ProviderId, model: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.id === model)
}

/** Default models pre-selected in playground / benchmarks when available. */
export const DEFAULT_COMPARE_MODEL_IDS = [
  'gemini-3.1-flash-lite-preview',
  'gpt-4o-mini',
  'qwen-vl-plus',
] as const

export function listProviders(): ProviderId[] {
  return ['gemini', 'openai', 'qwen']
}

export function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case 'gemini':
      return 'Google Gemini'
    case 'openai':
      return 'OpenAI'
    case 'qwen':
      return 'Qwen'
  }
}
