import { getModelDefinition, splitModelId } from './registry'
import type { ModelCapabilities } from './types'

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: true,
  temperature: true,
  maxOutputTokens: true,
  reasoning: false,
  imageQuality: false,
  structuredOutput: true,
}

function isOpenAiReasoningModel(model: string): boolean {
  const lower = model.toLowerCase()
  return /^(o[1-9]|gpt-5)/.test(lower)
}

/** Infer capabilities for a Gateway model id, preferring curated registry entries. */
export function resolveCapabilities(
  modelId: string,
  hints?: Partial<ModelCapabilities>
): ModelCapabilities {
  const known = getModelDefinition(modelId)
  if (known) return { ...known.capabilities, ...hints }

  const { provider, model } = splitModelId(modelId)

  switch (provider) {
    case 'google':
      return {
        ...DEFAULT_CAPABILITIES,
        reasoning: hints?.reasoning ?? /pro|thinking|2\.5|3\./i.test(model),
        ...hints,
      }
    case 'openai': {
      const reasoning = hints?.reasoning ?? isOpenAiReasoningModel(model)
      return {
        vision: true,
        temperature: !reasoning,
        maxOutputTokens: true,
        reasoning,
        imageQuality: true,
        structuredOutput: true,
        ...hints,
      }
    }
    case 'alibaba':
      return {
        ...DEFAULT_CAPABILITIES,
        reasoning: hints?.reasoning ?? /thinking|qwen3/i.test(model),
        ...hints,
      }
    default:
      return { ...DEFAULT_CAPABILITIES, ...hints }
  }
}

export function humanizeModelId(id: string): string {
  const short = id.includes('/') ? id.split('/').slice(1).join('/') : id
  return short
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
