import { getModelDefinition } from './registry'
import type { ModelCapabilities, ProviderId } from './types'

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  temperature: true,
  maxOutputTokens: true,
  reasoning: false,
  imageQuality: false,
  structuredOutput: true,
}

function isOpenAiReasoningModel(model: string): boolean {
  return /^(o[1-9]|o\d)/i.test(model) || model.includes('o1-') || model.includes('o3-') || model.includes('o4-')
}

/** Infer capabilities for a model id, preferring curated registry entries when present. */
export function resolveCapabilities(
  provider: ProviderId,
  modelId: string,
  hints?: Partial<ModelCapabilities>
): ModelCapabilities {
  const known = getModelDefinition(provider, modelId)
  // Prefer curated registry capabilities for known models.
  if (known) return known.capabilities

  switch (provider) {
    case 'gemini':
      return {
        ...DEFAULT_CAPABILITIES,
        reasoning:
          hints?.reasoning ??
          /pro|thinking|2\.5|3\./i.test(modelId),
        ...hints,
      }
    case 'openai': {
      const reasoning = hints?.reasoning ?? isOpenAiReasoningModel(modelId)
      return {
        temperature: !reasoning,
        maxOutputTokens: true,
        reasoning,
        imageQuality: true,
        structuredOutput: !reasoning,
        ...hints,
      }
    }
    case 'qwen':
      return {
        ...DEFAULT_CAPABILITIES,
        reasoning:
          hints?.reasoning ??
          /thinking|qwen3/i.test(modelId),
        ...hints,
      }
    default:
      return { ...DEFAULT_CAPABILITIES, ...hints }
  }
}

export function humanizeModelId(id: string): string {
  return id
    .replace(/^models\//, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(\.\d+)*$/.test(part)) return part
      if (/^(gpt|o\d+|vl)$/i.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}
