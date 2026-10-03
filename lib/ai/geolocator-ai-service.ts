import { z } from 'zod'
import { generateObject } from 'ai'
import { randomUUID } from 'crypto'
import { getReadyDb } from '@/lib/db'
import { modelUsage } from '@/lib/db/schema'
import { resolveCapabilities } from './capabilities'
import { classifyGatewayError, sanitizeErrorMessage } from './errors'
import { normalizeGeoLocationResult } from './normalize'
import { splitModelId } from './registry'
import type {
  AnalysisMode,
  GeoLocatorExecution,
  ImageQuality,
  NormalizedModelConfig,
  ReasoningLevel,
} from './types'
import { GatewayError } from './types'

const confidenceSchema = z.enum(['Very High', 'High', 'Medium', 'Low', 'Very Low'])

const geoLocationSchema = z.object({
  locations: z
    .array(
      z.object({
        city: z.string().optional(),
        region: z.string().optional(),
        country: z.string(),
        location: z.string().optional(),
        confidence: z.union([confidenceSchema, z.number(), z.string()]).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        clues: z
          .object({
            numbered: z.array(z.string()).optional(),
            summary: z.string().optional(),
          })
          .optional(),
        reasoning: z.string().optional(),
      })
    )
    .min(1)
    .max(5),
})

export type AnalyzeLocationOptions = {
  imageBase64: string
  mimeType: string
  config: NormalizedModelConfig
  mode: AnalysisMode
  requestId?: string
  /** Pin underlying inference provider for reproducible benchmarks. */
  pinProvider?: string
  /** Anonymous session/user id for Gateway attribution. */
  user?: string
  includeRaw?: boolean
  /** When true (default for all modes), write a usage metadata row. */
  logUsage?: boolean
}

function extractReportedCost(providerMetadata: unknown): number | undefined {
  if (!providerMetadata || typeof providerMetadata !== 'object') return undefined
  const meta = providerMetadata as Record<string, unknown>
  const gateway = meta.gateway
  if (gateway && typeof gateway === 'object') {
    const g = gateway as Record<string, unknown>
    for (const key of ['cost', 'totalCost', 'usage', 'costUsd', 'total_cost']) {
      const v = g[key]
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
    }
  }
  return undefined
}

function extractGatewayProvider(providerMetadata: unknown, modelId: string): string | undefined {
  if (providerMetadata && typeof providerMetadata === 'object') {
    const meta = providerMetadata as Record<string, unknown>
    const gateway = meta.gateway
    if (gateway && typeof gateway === 'object') {
      const g = gateway as Record<string, unknown>
      const routing = g.routing
      if (routing && typeof routing === 'object') {
        const r = routing as Record<string, unknown>
        for (const key of ['provider', 'providerName', 'actualProvider', 'servedBy']) {
          if (typeof r[key] === 'string' && r[key]) return r[key] as string
        }
      }
      for (const key of ['provider', 'providerName', 'actualProvider']) {
        if (typeof g[key] === 'string' && g[key]) return g[key] as string
      }
    }
  }
  return splitModelId(modelId).provider
}

function mapReasoningToProviderOptions(
  modelId: string,
  level: ReasoningLevel
): Record<string, unknown> | undefined {
  const { provider } = splitModelId(modelId)
  if (provider === 'openai') {
    if (level === 'none') return undefined
    return {
      openai: {
        reasoningEffort: level === 'low' ? 'low' : level === 'high' ? 'high' : 'medium',
      },
    }
  }
  if (provider === 'google') {
    const budget = level === 'none' ? 0 : level === 'low' ? 1024 : level === 'high' ? 8192 : 4096
    return {
      google: {
        thinkingConfig: { thinkingBudget: budget },
      },
    }
  }
  if (provider === 'alibaba') {
    if (level === 'none') {
      return { alibaba: { enableThinking: false } }
    }
    return {
      alibaba: {
        enableThinking: true,
        thinkingBudget: level === 'low' ? 1024 : level === 'high' ? 8192 : 4096,
      },
    }
  }
  return undefined
}

function mapImageQuality(quality: ImageQuality): 'low' | 'high' | 'auto' {
  if (quality === 'low') return 'low'
  if (quality === 'high') return 'high'
  return 'auto'
}

/**
 * Single GeoLocator AI entry point — all production, playground, and benchmark
 * inference goes through Vercel AI Gateway via this function.
 */
export async function analyzeLocation(
  options: AnalyzeLocationOptions
): Promise<GeoLocatorExecution> {
  const requestId = options.requestId || randomUUID()
  const modelId = options.config.modelId
  const capabilities = resolveCapabilities(modelId)
  const started = Date.now()

  const appliedSettings: GeoLocatorExecution['appliedSettings'] = {
    temperature: capabilities.temperature ? options.config.temperature : 'unsupported',
    maxOutputTokens: capabilities.maxOutputTokens
      ? options.config.maxOutputTokens
      : 'unsupported',
    reasoningLevel: capabilities.reasoning ? options.config.reasoningLevel : 'unsupported',
    imageQuality: capabilities.imageQuality ? options.config.imageQuality : 'unsupported',
  }

  if (!options.imageBase64) {
    const err = new GatewayError('INVALID_IMAGE', 'Image is required', modelId)
    await maybeLogUsage({ options, requestId, success: false, errorType: err.type })
    throw err
  }

  try {
    const callSettings: {
      temperature?: number
      maxOutputTokens?: number
    } = {}

    if (capabilities.temperature) {
      callSettings.temperature = options.config.temperature
    }
    if (capabilities.maxOutputTokens) {
      callSettings.maxOutputTokens = options.config.maxOutputTokens
    }

    const gatewayOptions: Record<string, unknown> = {
      tags: [`app:geolocator`, `mode:${options.mode}`],
      ...(options.mode === 'production'
        ? {
            disallowPromptTraining: true,
            zeroDataRetention: true,
          }
        : {}),
      ...(options.pinProvider ? { only: [options.pinProvider] } : {}),
      ...(options.user ? { user: options.user } : {}),
    }

    const providerOptions: Record<string, Record<string, unknown>> = {
      gateway: gatewayOptions,
    }

    if (capabilities.reasoning) {
      const reasoningOpts = mapReasoningToProviderOptions(modelId, options.config.reasoningLevel)
      if (reasoningOpts) {
        for (const [key, value] of Object.entries(reasoningOpts)) {
          providerOptions[key] = {
            ...(providerOptions[key] || {}),
            ...(value as Record<string, unknown>),
          }
        }
      }
    }

    if (capabilities.imageQuality) {
      const detail = mapImageQuality(options.config.imageQuality)
      providerOptions.openai = {
        ...(providerOptions.openai || {}),
        imageDetail: detail,
      }
    }

    const result = await generateObject({
      model: modelId,
      schema: geoLocationSchema,
      schemaName: 'GeoLocationResult',
      schemaDescription: 'Top location guesses for where a photograph was taken',
      system: options.config.prompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: Buffer.from(options.imageBase64, 'base64'),
              mediaType: options.mimeType,
            },
            {
              type: 'text',
              text: 'Analyze this photograph and return the JSON as instructed.',
            },
          ],
        },
      ],
      ...callSettings,
      providerOptions: providerOptions as Parameters<typeof generateObject>[0]['providerOptions'],
    })

    const output = normalizeGeoLocationResult(result.object, modelId)
    const gatewayProvider = extractGatewayProvider(result.providerMetadata, modelId)
    const reportedCost = extractReportedCost(result.providerMetadata)
    const latencyMs = Date.now() - started

    const execution: GeoLocatorExecution = {
      requestId,
      modelId,
      gateway: { provider: gatewayProvider },
      result: output,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        reportedCost,
      },
      latencyMs,
      appliedSettings,
      ...(options.includeRaw ? { rawResponse: result } : {}),
    }

    await maybeLogUsage({
      options,
      requestId,
      success: true,
      execution,
    })

    return execution
  } catch (err) {
    const gatewayError = classifyGatewayError(err, modelId)
    await maybeLogUsage({
      options,
      requestId,
      success: false,
      errorType: gatewayError.type,
      latencyMs: Date.now() - started,
    })
    console.error(`[analyzeLocation:${modelId}]`, sanitizeErrorMessage(gatewayError.message))
    throw gatewayError
  }
}

async function maybeLogUsage(args: {
  options: AnalyzeLocationOptions
  requestId: string
  success: boolean
  execution?: GeoLocatorExecution
  errorType?: string
  latencyMs?: number
}) {
  if (args.options.logUsage === false) return

  try {
    const { provider, model } = splitModelId(args.options.config.modelId)
    const db = await getReadyDb()
    await db.insert(modelUsage).values({
      requestId: args.requestId,
      mode: args.options.mode,
      provider,
      model,
      modelId: args.options.config.modelId,
      gatewayProvider: args.execution?.gateway.provider ?? null,
      modelConfigId: args.options.config.id || null,
      temperature: args.options.config.temperature,
      maxOutputTokens: args.options.config.maxOutputTokens,
      reasoningLevel: args.options.config.reasoningLevel,
      imageQuality: args.options.config.imageQuality,
      inputTokens: args.execution?.usage.inputTokens ?? null,
      outputTokens: args.execution?.usage.outputTokens ?? null,
      totalTokens: args.execution?.usage.totalTokens ?? null,
      providerCost: args.execution?.usage.reportedCost ?? null,
      latencyMs: args.execution?.latencyMs ?? args.latencyMs ?? null,
      success: args.success,
      errorType: args.errorType ?? null,
      retryCount: 0,
    })
  } catch (logErr) {
    console.error(
      '[model_usage] failed to persist usage log',
      sanitizeErrorMessage(logErr instanceof Error ? logErr.message : String(logErr))
    )
  }
}
