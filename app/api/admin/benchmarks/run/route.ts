import { NextRequest, NextResponse } from 'next/server'
import { desc, eq, inArray } from 'drizzle-orm'
import { getReadyDb } from '@/lib/db'
import { benchmarkCases, benchmarkResults, benchmarkRuns } from '@/lib/db/schema'
import { requireAdminApi } from '@/lib/auth/admin'
import { fetchPrivateBlob } from '@/lib/blob'
import {
  runModel,
  getProductionModelConfig,
  scoreAgainstGroundTruth,
  adminFacingError,
  ProviderError,
  type NormalizedModelConfig,
  type ProviderId,
  type ReasoningLevel,
  type ImageQuality,
  type ResponseFormat,
} from '@/lib/ai'

type ModelSelection = { provider: ProviderId; model: string }

async function imageToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const result = await fetchPrivateBlob(url)
  if (!result) throw new Error('Benchmark image not found in storage')
  return {
    base64: result.buffer.toString('base64'),
    mimeType: result.contentType || 'image/jpeg',
  }
}

export async function GET(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const runId = req.nextUrl.searchParams.get('runId')
    const db = await getReadyDb()

    if (runId) {
      const [run] = await db.select().from(benchmarkRuns).where(eq(benchmarkRuns.id, runId)).limit(1)
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

      const results = await db
        .select()
        .from(benchmarkResults)
        .where(eq(benchmarkResults.benchmarkRunId, runId))

      const caseIds = [...new Set(results.map((r) => r.benchmarkCaseId))]
      const cases = caseIds.length
        ? await db.select().from(benchmarkCases).where(inArray(benchmarkCases.id, caseIds))
        : []

      return NextResponse.json({ run, results, cases, summary: summarize(results) })
    }

    const runs = await db.select().from(benchmarkRuns).orderBy(desc(benchmarkRuns.createdAt)).limit(20)
    return NextResponse.json({ runs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load runs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const body = await req.json()
    const caseIds = (body.caseIds || []) as string[]
    const models = (body.models || []) as ModelSelection[]

    if (!caseIds.length) {
      return NextResponse.json({ error: 'Select at least one benchmark case' }, { status: 400 })
    }
    if (!models.length) {
      return NextResponse.json({ error: 'Select at least one model' }, { status: 400 })
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

    const db = await getReadyDb()
    const cases = await db.select().from(benchmarkCases).where(inArray(benchmarkCases.id, caseIds))
    if (!cases.length) {
      return NextResponse.json({ error: 'No matching cases found' }, { status: 404 })
    }

    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        configuration: {
          models,
          caseIds,
          settings: baseConfig,
        },
      })
      .returning()

    const inserted = []

    for (const c of cases) {
      let imagePayload: { base64: string; mimeType: string }
      try {
        imagePayload = await imageToBase64(c.imageUrl)
      } catch (err) {
        for (const sel of models) {
          const [row] = await db
            .insert(benchmarkResults)
            .values({
              benchmarkRunId: run.id,
              benchmarkCaseId: c.id,
              provider: sel.provider,
              model: sel.model,
              success: false,
              errorType: 'PROVIDER_ERROR',
              errorMessage: err instanceof Error ? err.message : 'Image load failed',
              countryCorrect: false,
              regionCorrect: c.region ? false : null,
              cityCorrect: c.city ? false : null,
              top3Correct: false,
            })
            .returning()
          inserted.push(row)
        }
        continue
      }

      const modelResults = await Promise.all(
        models.map(async (sel) => {
          const config: NormalizedModelConfig = {
            ...baseConfig,
            provider: sel.provider,
            model: sel.model,
          }

          try {
            const result = await runModel({
              config,
              imageBase64: imagePayload.base64,
              mimeType: imagePayload.mimeType,
              source: 'benchmark',
            })

            const scores = scoreAgainstGroundTruth(result.output, {
              country: c.country,
              region: c.region,
              city: c.city,
            })

            const [row] = await db
              .insert(benchmarkResults)
              .values({
                benchmarkRunId: run.id,
                benchmarkCaseId: c.id,
                provider: sel.provider,
                model: sel.model,
                normalizedOutput: result.output,
                countryCorrect: scores.countryCorrect,
                regionCorrect: scores.regionCorrect,
                cityCorrect: scores.cityCorrect,
                top3Correct: scores.top3Correct,
                latencyMs: result.latencyMs,
                providerCost: result.usage.providerReportedCost ?? null,
                inputTokens: result.usage.inputTokens ?? null,
                outputTokens: result.usage.outputTokens ?? null,
                success: true,
              })
              .returning()
            return row
          } catch (err) {
            const pe = err instanceof ProviderError ? err : null
            const [row] = await db
              .insert(benchmarkResults)
              .values({
                benchmarkRunId: run.id,
                benchmarkCaseId: c.id,
                provider: sel.provider,
                model: sel.model,
                success: false,
                errorType: pe?.type || 'PROVIDER_ERROR',
                errorMessage: pe ? adminFacingError(pe.type) : 'Request failed',
                countryCorrect: false,
                regionCorrect: c.region ? false : null,
                cityCorrect: c.city ? false : null,
                top3Correct: false,
              })
              .returning()
            return row
          }
        })
      )

      inserted.push(...modelResults)
    }

    return NextResponse.json({
      run,
      results: inserted,
      summary: summarize(inserted),
      cases,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Benchmark run failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function summarize(results: Array<{
  provider: string
  model: string
  countryCorrect: boolean | null
  regionCorrect: boolean | null
  cityCorrect: boolean | null
  top3Correct: boolean | null
  latencyMs: number | null
  providerCost: number | null
  success: boolean
}>) {
  const groups = new Map<string, typeof results>()
  for (const r of results) {
    const key = `${r.provider}:${r.model}`
    const list = groups.get(key) || []
    list.push(r)
    groups.set(key, list)
  }

  return [...groups.entries()].map(([key, rows]) => {
    const [provider, model] = key.split(':')
    const rate = (field: 'countryCorrect' | 'regionCorrect' | 'cityCorrect' | 'top3Correct') => {
      const scored = rows.filter((r) => r[field] !== null)
      if (!scored.length) return null
      const correct = scored.filter((r) => r[field] === true).length
      return (correct / scored.length) * 100
    }
    const latencies = rows.map((r) => r.latencyMs).filter((n): n is number => n != null)
    const costs = rows.map((r) => r.providerCost).filter((n): n is number => n != null)

    return {
      provider,
      model,
      samples: rows.length,
      countryAccuracy: rate('countryCorrect'),
      regionAccuracy: rate('regionCorrect'),
      cityAccuracy: rate('cityCorrect'),
      top3Accuracy: rate('top3Correct'),
      avgLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      totalCost: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      successRate: (rows.filter((r) => r.success).length / rows.length) * 100,
    }
  })
}
