import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getReadyDb } from '@/lib/db'
import { playgroundResults, playgroundRuns } from '@/lib/db/schema'
import { requireAdminApi } from '@/lib/auth/admin'
import {
  analyzeLocation,
  getProductionModelConfig,
  adminFacingError,
  sanitizeErrorMessage,
  GatewayError,
  resolveCapabilities,
  splitModelId,
  type NormalizedModelConfig,
  type ReasoningLevel,
  type ImageQuality,
  type ResponseFormat,
} from '@/lib/ai'

type ModelSelection = {
  modelId?: string
  provider?: string
  model?: string
}

export async function POST(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const body = await req.json()
    const imageBase64 = String(body.image || '')
    const mimeType = String(body.mimeType || 'image/jpeg')
    const models = (body.models || []) as ModelSelection[]

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    const modelIds = models
      .map((m) => {
        if (m.modelId) return String(m.modelId)
        if (m.provider && m.model) {
          return m.model.includes('/') ? m.model : `${m.provider}/${m.model}`
        }
        if (m.model?.includes('/')) return m.model
        return ''
      })
      .filter(Boolean)

    if (modelIds.length < 2) {
      return NextResponse.json({ error: 'Select at least two models' }, { status: 400 })
    }

    const production = await getProductionModelConfig()
    const baseConfig: Omit<NormalizedModelConfig, 'modelId'> = {
      prompt: typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : production.prompt,
      temperature: Number(body.temperature ?? production.temperature),
      maxOutputTokens: Number(body.maxOutputTokens ?? production.maxOutputTokens),
      reasoningLevel: (body.reasoningLevel || production.reasoningLevel) as ReasoningLevel,
      imageQuality: (body.imageQuality || production.imageQuality) as ImageQuality,
      responseFormat: (body.responseFormat || production.responseFormat) as ResponseFormat,
    }

    const db = await getReadyDb()
    const [run] = await db.insert(playgroundRuns).values({}).returning()

    const settled = await Promise.all(
      modelIds.map(async (modelId) => {
        const config: NormalizedModelConfig = {
          ...baseConfig,
          modelId,
        }
        const capabilities = resolveCapabilities(modelId)
        const { provider, model } = splitModelId(modelId)
        const unsupportedSettings = {
          temperature: !capabilities.temperature,
          maxOutputTokens: !capabilities.maxOutputTokens,
          reasoning: !capabilities.reasoning,
          imageQuality: !capabilities.imageQuality,
        }

        try {
          const result = await analyzeLocation({
            config,
            imageBase64,
            mimeType,
            mode: 'playground',
          })

          const [row] = await db
            .insert(playgroundResults)
            .values({
              playgroundRunId: run.id,
              provider,
              model,
              modelId,
              gatewayProvider: result.gateway.provider ?? null,
              configuration: {
                ...config,
                appliedSettings: result.appliedSettings,
                unsupportedSettings,
              },
              normalizedOutput: result.result,
              inputTokens: result.usage.inputTokens ?? null,
              outputTokens: result.usage.outputTokens ?? null,
              providerCost: result.usage.reportedCost ?? null,
              latencyMs: result.latencyMs,
              success: true,
            })
            .returning()

          return {
            id: row.id,
            modelId,
            provider,
            model,
            gatewayProvider: result.gateway.provider,
            success: true,
            output: result.result,
            usage: {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens: result.usage.totalTokens,
              reportedCost: result.usage.reportedCost,
              providerReportedCost: result.usage.reportedCost,
            },
            latencyMs: result.latencyMs,
            appliedSettings: result.appliedSettings,
            unsupportedSettings,
            qualityRating: null,
            locationRating: null,
            adminNote: null,
          }
        } catch (err) {
          const pe = err instanceof GatewayError ? err : null
          const errorType = pe?.type || 'GATEWAY_ERROR'
          const facing = pe ? adminFacingError(pe.type) : 'Request failed'
          const detail =
            pe?.message && pe.message !== facing
              ? sanitizeErrorMessage(pe.message)
              : undefined
          const errorMessage = detail && !detail.toLowerCase().includes(facing.toLowerCase())
            ? `${facing} (${detail.slice(0, 160)})`
            : facing

          const [row] = await db
            .insert(playgroundResults)
            .values({
              playgroundRunId: run.id,
              provider,
              model,
              modelId,
              configuration: { ...config, unsupportedSettings },
              success: false,
              errorType,
              errorMessage,
            })
            .returning()

          return {
            id: row.id,
            modelId,
            provider,
            model,
            success: false,
            errorType,
            errorMessage,
            unsupportedSettings,
            qualityRating: null,
            locationRating: null,
            adminNote: null,
          }
        }
      })
    )

    return NextResponse.json({ runId: run.id, results: settled })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Playground run failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const db = await getReadyDb()
    const patch: {
      qualityRating?: string | null
      locationRating?: string | null
      adminNote?: string | null
    } = {}
    if ('qualityRating' in body) patch.qualityRating = body.qualityRating || null
    if ('locationRating' in body) patch.locationRating = body.locationRating || null
    if ('adminNote' in body) patch.adminNote = body.adminNote || null

    const [updated] = await db
      .update(playgroundResults)
      .set(patch)
      .where(eq(playgroundResults.id, id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 })
    }

    return NextResponse.json({ result: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
