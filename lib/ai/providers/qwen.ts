import OpenAI from 'openai'
import { classifyProviderError } from '../errors'
import { normalizeGeoLocationResult } from '../normalize'
import type { ModelExecutionResult, ModelRequest, VisionModelProvider } from '../types'
import { ProviderError } from '../types'

const QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

function getClient() {
  const apiKey = process.env.QWEN_API_KEY
  if (!apiKey) {
    throw new ProviderError('AUTHENTICATION_ERROR', 'QWEN_API_KEY is not set', 'qwen')
  }
  return new OpenAI({ apiKey, baseURL: QWEN_BASE_URL })
}

export const qwenProvider: VisionModelProvider = {
  async run(request: ModelRequest): Promise<ModelExecutionResult> {
    const started = Date.now()
    try {
      const client = getClient()
      const dataUrl = `data:${request.mimeType};base64,${request.imageBase64}`

      const completion = await client.chat.completions.create({
        model: request.config.model,
        temperature: request.config.temperature,
        max_tokens: request.config.maxOutputTokens,
        messages: [
          { role: 'system', content: request.config.prompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
              {
                type: 'text',
                text: 'Analyze this photograph and return the JSON as instructed.',
              },
            ],
          },
        ],
        response_format:
          request.config.responseFormat === 'structured_json'
            ? { type: 'json_object' }
            : undefined,
      })

      const text = completion.choices[0]?.message?.content?.trim() || ''
      const output = normalizeGeoLocationResult(text, 'qwen')

      return {
        provider: 'qwen',
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
      throw classifyProviderError(err, 'qwen')
    }
  },
}
