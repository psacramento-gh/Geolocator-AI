import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { playgroundResults, playgroundRuns } from '@/lib/db/schema'
import { requireAdminApi } from '@/lib/auth/admin'
import {
  runModel,
  getProductionModelConfig,
  adminFacingError,
  ProviderError,
  type NormalizedModelConfig,
  type ProviderId,
  type ReasoningLevel,
  type ImageQuality,
  type ResponseFormat,
} from '@/lib/ai'

type ModelSelection = {
  provider: ProviderId
  model: string
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
    if (!Array.isArray(models) || models.length < 2) {
      return NextResponse.json({ error: 'Select at least two models' }, { status: 400 })
    }

    const production = await getProductionModelConfig()
    const baseConfig: Omit<NormalizedModelConfig, 'provider' | 'model'> = {
      prompt: typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : production.prompt,
      temperature: Number(body.temperature ?? production.temperature),
      maxOutputTokens: Number(body.maxOutputTokens ?? production.maxOutputTokens),
      reasoningLevel: (body.reasoningLevel || production.reasoningLevel) as ReasoningLevel,
      imageQuality: (body.imageQuality || production.imageQuality) as ImageQuality,
      responseFormat: (body.responseFormat || production.responseFormat) as ResponseFormat,
    }

    const db = getDb()
    const [run] = await db.insert(playgroundRuns).values({}).returning()

    const settled = await Promise.all(
      models.map(async (sel) => {
        const config: NormalizedModelConfig = {
          ...baseConfig,
          provider: sel.provider,
          model: sel.model,
        }

        try {
          const result = await runModel({
            config,
            imageBase64,
            mimeType,
            source: 'playground',
            includeRaw: false,
          })

          const [row] = await db
            .insert(playgroundResults)
            .values({
              playgroundRunId: run.id,
              provider: sel.provider,
              model: sel.model,
              configuration: config,
              normalizedOutput: result.output,
              inputTokens: result.usage.inputTokens ?? null,
              outputTokens: result.usage.outputTokens ?? null,
              providerCost: result.usage.providerReportedCost ?? null,
              latencyMs: result.latencyMs,
              success: true,
            })
            .returning()

          return {
            id: row.id,
            provider: sel.provider,
            model: sel.model,
            success: true,
            output: result.output,
            usage: result.usage,
            latencyMs: result.latencyMs,
            qualityRating: null,
            locationRating: null,
            adminNote: null,
          }
        } catch (err) {
          const pe = err instanceof ProviderError ? err : null
          const errorType = pe?.type || 'PROVIDER_ERROR'
          const errorMessage = pe ? adminFacingError(pe.type) : 'Request failed'

          const [row] = await db
            .insert(playgroundResults)
            .values({
              playgroundRunId: run.id,
              provider: sel.provider,
              model: sel.model,
              configuration: config,
              success: false,
              errorType,
              errorMessage,
            })
            .returning()

          return {
            id: row.id,
            provider: sel.provider,
            model: sel.model,
            success: false,
            errorType,
            errorMessage,
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

    const db = getDb()
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
