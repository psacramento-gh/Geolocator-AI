import { randomUUID } from 'crypto'
import { getReadyDb } from '@/lib/db'
import { modelUsage } from '@/lib/db/schema'
import { classifyProviderError, sanitizeErrorMessage } from './errors'
import { geminiProvider } from './providers/gemini'
import { openaiProvider } from './providers/openai'
import { qwenProvider } from './providers/qwen'
import type {
  ModelExecutionResult,
  NormalizedModelConfig,
  ProviderId,
  VisionModelProvider,
} from './types'
import { ProviderError } from './types'

const providers: Record<ProviderId, VisionModelProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  qwen: qwenProvider,
}

export type RunModelOptions = {
  config: NormalizedModelConfig
  imageBase64: string
  mimeType: string
  /** When 'production', write a usage log row (no image / no output). */
  source?: 'production' | 'playground' | 'benchmark'
  requestId?: string
  retryCount?: number
  /** Include raw provider payload (admin/debug only). */
  includeRaw?: boolean
}

export async function runModel(options: RunModelOptions): Promise<ModelExecutionResult> {
  const provider = providers[options.config.provider]
  if (!provider) {
    throw new ProviderError(
      'UNSUPPORTED_CONFIGURATION',
      `Unknown provider: ${options.config.provider}`,
      options.config.provider
    )
  }

  const requestId = options.requestId || randomUUID()
  const retryCount = options.retryCount ?? 0

  try {
    const result = await provider.run({
      config: options.config,
      imageBase64: options.imageBase64,
      mimeType: options.mimeType,
    })

    if (options.source === 'production') {
      await logUsage({
        requestId,
        config: options.config,
        result,
        success: true,
        retryCount,
      })
    }

    if (!options.includeRaw) {
      return {
        provider: result.provider,
        model: result.model,
        output: result.output,
        usage: result.usage,
        latencyMs: result.latencyMs,
      }
    }

    return result
  } catch (err) {
    const providerError = classifyProviderError(err, options.config.provider)

    if (options.source === 'production') {
      await logUsage({
        requestId,
        config: options.config,
        success: false,
        errorType: providerError.type,
        latencyMs: undefined,
        retryCount,
      })
    }

    // Avoid leaking secrets into server logs
    console.error(`[runModel:${options.config.provider}]`, sanitizeErrorMessage(providerError.message))
    throw providerError
  }
}

async function logUsage(args: {
  requestId: string
  config: NormalizedModelConfig
  result?: ModelExecutionResult
  success: boolean
  errorType?: string
  latencyMs?: number
  retryCount: number
}) {
  try {
    const db = await getReadyDb()
    await db.insert(modelUsage).values({
      requestId: args.requestId,
      provider: args.config.provider,
      model: args.config.model,
      modelConfigId: args.config.id || null,
      temperature: args.config.temperature,
      maxOutputTokens: args.config.maxOutputTokens,
      reasoningLevel: args.config.reasoningLevel,
      imageQuality: args.config.imageQuality,
      inputTokens: args.result?.usage.inputTokens ?? null,
      outputTokens: args.result?.usage.outputTokens ?? null,
      totalTokens: args.result?.usage.totalTokens ?? null,
      providerCost: args.result?.usage.providerReportedCost ?? null,
      latencyMs: args.result?.latencyMs ?? args.latencyMs ?? null,
      success: args.success,
      errorType: args.errorType ?? null,
      retryCount: args.retryCount,
    })
  } catch (logErr) {
    console.error('[model_usage] failed to persist usage log', sanitizeErrorMessage(
      logErr instanceof Error ? logErr.message : String(logErr)
    ))
  }
}

export function getProvider(provider: ProviderId): VisionModelProvider {
  return providers[provider]
}
