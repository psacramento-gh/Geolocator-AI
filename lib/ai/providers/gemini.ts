import { classifyProviderError } from '../errors'
import { normalizeGeoLocationResult } from '../normalize'
import type { ModelExecutionResult, ModelRequest, ReasoningLevel, VisionModelProvider } from '../types'
import { ProviderError } from '../types'
import { resolveCapabilities } from '../capabilities'
import { getGeminiClient } from './gemini-client'

function getClient() {
  try {
    return getGeminiClient()
  } catch {
    throw new ProviderError('AUTHENTICATION_ERROR', 'GEMINI_API_KEY is not set', 'gemini')
  }
}

/** Map normalized reasoning level to Gemini thinkingBudget (tokens). */
function thinkingBudgetFor(level: ReasoningLevel): number | undefined {
  switch (level) {
    case 'none':
      return 0
    case 'low':
      return 1024
    case 'medium':
      return 4096
    case 'high':
      return 8192
    default:
      return undefined
  }
}

export const geminiProvider: VisionModelProvider = {
  async run(request: ModelRequest): Promise<ModelExecutionResult> {
    const started = Date.now()
    try {
      const genAI = getClient()
      const capabilities = resolveCapabilities('gemini', request.config.model)
      const generationConfig: {
        temperature?: number
        maxOutputTokens?: number
        responseMimeType?: string
        // Thinking config is supported by Gemini 2.5+ reasoning models.
        thinkingConfig?: { thinkingBudget: number }
      } = {}

      if (typeof request.config.temperature === 'number') {
        generationConfig.temperature = request.config.temperature
      }
      if (request.config.maxOutputTokens) {
        generationConfig.maxOutputTokens = request.config.maxOutputTokens
      }
      if (request.config.responseFormat === 'structured_json') {
        generationConfig.responseMimeType = 'application/json'
      }

      if (capabilities.reasoning) {
        const budget = thinkingBudgetFor(request.config.reasoningLevel)
        if (budget !== undefined) {
          generationConfig.thinkingConfig = { thinkingBudget: budget }
        }
      }

      const model = genAI.getGenerativeModel({
        model: request.config.model,
        systemInstruction: request.config.prompt,
        generationConfig,
      })

      const result = await model.generateContent([
        {
          inlineData: {
            data: request.imageBase64,
            mimeType: request.mimeType,
          },
        },
        'Analyze this photograph and return the JSON as instructed.',
      ])

      const text = result.response.text().trim()
      const output = normalizeGeoLocationResult(text, 'gemini')

      const usageMeta = result.response.usageMetadata
      const inputTokens = usageMeta?.promptTokenCount
      const outputTokens = usageMeta?.candidatesTokenCount
      const totalTokens = usageMeta?.totalTokenCount

      return {
        provider: 'gemini',
        model: request.config.model,
        output,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
        },
        latencyMs: Date.now() - started,
        rawResponse: { text, usageMetadata: usageMeta },
      }
    } catch (err) {
      throw classifyProviderError(err, 'gemini')
    }
  },
}
