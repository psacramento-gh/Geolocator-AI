import { classifyProviderError } from '../errors'
import { normalizeGeoLocationResult } from '../normalize'
import type { ModelExecutionResult, ModelRequest, VisionModelProvider } from '../types'
import { ProviderError } from '../types'
import { getGeminiClient } from './gemini-client'

function getClient() {
  try {
    return getGeminiClient()
  } catch {
    throw new ProviderError('AUTHENTICATION_ERROR', 'GEMINI_API_KEY is not set', 'gemini')
  }
}

export const geminiProvider: VisionModelProvider = {
  async run(request: ModelRequest): Promise<ModelExecutionResult> {
    const started = Date.now()
    try {
      const genAI = getClient()
      const generationConfig: {
        temperature?: number
        maxOutputTokens?: number
        responseMimeType?: string
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

      const model = genAI.getGenerativeModel({
        model: request.config.model,
        systemInstruction: request.config.prompt,
        generationConfig,
      })

      const result = await model.generateContent([
        {
          inlineData: {
            data: request.config.imageQuality === 'low'
              ? request.imageBase64
              : request.imageBase64,
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
