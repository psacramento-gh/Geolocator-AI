import OpenAI from 'openai'
import { classifyProviderError } from '../errors'
import { normalizeGeoLocationResult } from '../normalize'
import type { ImageQuality, ModelExecutionResult, ModelRequest, ReasoningLevel, VisionModelProvider } from '../types'
import { ProviderError } from '../types'

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new ProviderError('AUTHENTICATION_ERROR', 'OPENAI_API_KEY is not set', 'openai')
  }
  return new OpenAI({ apiKey })
}

function mapDetail(quality: ImageQuality): 'low' | 'high' | 'auto' {
  if (quality === 'low') return 'low'
  if (quality === 'high') return 'high'
  return 'auto'
}

function mapReasoningEffort(level: ReasoningLevel): 'low' | 'medium' | 'high' | undefined {
  if (level === 'none') return undefined
  if (level === 'low') return 'low'
  if (level === 'high') return 'high'
  return 'medium'
}

function isReasoningModel(model: string): boolean {
  return model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')
}

export const openaiProvider: VisionModelProvider = {
  async run(request: ModelRequest): Promise<ModelExecutionResult> {
    const started = Date.now()
    try {
      const client = getClient()
      const dataUrl = `data:${request.mimeType};base64,${request.imageBase64}`
      const reasoning = isReasoningModel(request.config.model)

      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: request.config.model,
        messages: [
          { role: 'system', content: request.config.prompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: mapDetail(request.config.imageQuality),
                },
              },
              {
                type: 'text',
                text: 'Analyze this photograph and return the JSON as instructed.',
              },
            ],
          },
        ],
        max_completion_tokens: request.config.maxOutputTokens,
      }

      if (!reasoning) {
        params.temperature = request.config.temperature
        if (request.config.responseFormat === 'structured_json') {
          params.response_format = { type: 'json_object' }
        }
      }

      // Reasoning models accept reasoning_effort via the Responses-compatible field when available.
      if (reasoning) {
        const effort = mapReasoningEffort(request.config.reasoningLevel)
        if (effort) {
          ;(params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
            reasoning_effort?: string
          }).reasoning_effort = effort
        }
      }

      const completion = await client.chat.completions.create(params)
      const text = completion.choices[0]?.message?.content?.trim() || ''
      const output = normalizeGeoLocationResult(text, 'openai')

      return {
        provider: 'openai',
        model: request.config.model,
        output,
        usage: {
          inputTokens: completion.usage?.prompt_tokens,
          outputTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        },
        latencyMs: Date.now() - started,
        rawResponse: completion,
      }
    } catch (err) {
      throw classifyProviderError(err, 'openai')
    }
  },
}
