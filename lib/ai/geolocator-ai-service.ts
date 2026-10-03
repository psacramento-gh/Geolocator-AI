import { z } from 'zod'
import { generateObject, generateText, NoObjectGeneratedError } from 'ai'
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
  TokenUsage,
} from './types'
import { GatewayError } from './types'

/**
 * Structured-output schema kept deliberately simple (no unions / anyOf).
 * OpenAI strict JSON schema and several Gateway providers reject Zod unions.
 * Loose string/number coercion is applied in normalizeGeoLocationResult.
 */
const geoLocationSchema = z.object({
  locations: z
    .array(
      z.object({
        city: z.string().nullish(),
        region: z.string().nullish(),
        country: z.string().nullish(),
        location: z.string().nullish(),
        confidence: z.string().nullish(),
        latitude: z.number().nullish(),
        longitude: z.number().nullish(),
        clues: z
          .object({
            numbered: z.array(z.string()).nullish(),
            summary: z.string().nullish(),
          })
          .nullish(),
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
        for (const key of [
          'finalProvider',
          'provider',
          'providerName',
          'actualProvider',
          'servedBy',
        ]) {
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
    // Always send an explicit effort — omitting it leaves the provider default (medium).
    const reasoningEffort =
      level === 'none'
        ? 'none'
        : level === 'low'
          ? 'low'
          : level === 'high'
            ? 'high'
            : 'medium'
    return {
      openai: { reasoningEffort },
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

function usageFromSdk(usage: {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}): TokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }
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

    const imagePart = {
      type: 'image' as const,
      image: Buffer.from(options.imageBase64, 'base64'),
      mediaType: options.mimeType,
      ...(capabilities.imageQuality
        ? {
            providerOptions: {
              openai: { imageDetail: mapImageQuality(options.config.imageQuality) },
            },
          }
        : {}),
    }

    const messages = [
      {
        role: 'user' as const,
        content: [
          imagePart,
          {
            type: 'text' as const,
            text: 'Analyze this photograph and return the JSON as instructed.',
          },
        ],
      },
    ]

    const sharedCall = {
      model: modelId,
      system: options.config.prompt,
      messages,
      ...callSettings,
      providerOptions: providerOptions as Parameters<typeof generateObject>[0]['providerOptions'],
    }

    let output
    let usage: TokenUsage = {}
    let gatewayProvider: string | undefined
    let reportedCost: number | undefined
    let rawResponse: unknown

    try {
      const result = await generateObject({
        ...sharedCall,
        schema: geoLocationSchema,
        schemaName: 'GeoLocationResult',
        schemaDescription: 'Top location guesses for where a photograph was taken',
      })
      output = normalizeGeoLocationResult(result.object, modelId)
      usage = usageFromSdk(result.usage)
      reportedCost = extractReportedCost(result.providerMetadata)
      gatewayProvider = extractGatewayProvider(result.providerMetadata, modelId)
      rawResponse = result
    } catch (structuredErr) {
      // Many vision models return almost-valid JSON that fails strict schema checks.
      // Recover from the raw text when present, otherwise fall back to plain JSON generation.
      if (NoObjectGeneratedError.isInstance(structuredErr) && structuredErr.text) {
        try {
          output = normalizeGeoLocationResult(structuredErr.text, modelId)
          usage = usageFromSdk(structuredErr.usage || {})
          gatewayProvider = splitModelId(modelId).provider
          rawResponse = { recoveredFrom: 'NoObjectGeneratedError', text: structuredErr.text }
        } catch {
          // Continue to generateText fallback below.
          output = undefined
        }
      }

      if (!output) {
        const classified = classifyGatewayError(structuredErr, modelId)
        if (
          classified.type === 'AUTH_ERROR' ||
          classified.type === 'BUDGET_EXCEEDED' ||
          classified.type === 'RATE_LIMITED' ||
          classified.type === 'MODEL_UNAVAILABLE' ||
          classified.type === 'INVALID_IMAGE'
        ) {
          throw structuredErr
        }

        const textResult = await generateText({
          ...sharedCall,
          messages: [
            {
              role: 'user',
              content: [
                imagePart,
                {
                  type: 'text',
                  text:
                    'Analyze this photograph and return ONLY valid JSON matching the schema in the system prompt. Do not wrap in markdown.',
                },
              ],
            },
          ],
        })
        output = normalizeGeoLocationResult(textResult.text, modelId)
        usage = {
          ...usageFromSdk(textResult.usage),
          reportedCost: extractReportedCost(textResult.providerMetadata),
        }
        reportedCost = usage.reportedCost
        gatewayProvider = extractGatewayProvider(textResult.providerMetadata, modelId)
        rawResponse = textResult
      }
    }

    const latencyMs = Date.now() - started

    const execution: GeoLocatorExecution = {
      requestId,
      modelId,
      gateway: { provider: gatewayProvider },
      result: output,
      usage: {
        ...usage,
        reportedCost: reportedCost ?? usage.reportedCost,
      },
      latencyMs,
      appliedSettings,
      ...(options.includeRaw ? { rawResponse } : {}),
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
