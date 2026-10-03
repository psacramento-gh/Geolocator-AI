import { NextRequest, NextResponse } from 'next/server'
import { and, gte, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { modelUsage } from '@/lib/db/schema'
import { requireAdminApi } from '@/lib/auth/admin'

function rangeStart(range: string): Date {
  const now = new Date()
  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
  // today — start of UTC day
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export async function GET(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const range = req.nextUrl.searchParams.get('range') || '7d'
    const since = rangeStart(range)
    const db = getDb()

    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${modelUsage.success})::int`,
        failed: sql<number>`count(*) filter (where not ${modelUsage.success})::int`,
        totalCost: sql<number>`coalesce(sum(${modelUsage.providerCost}), 0)::float`,
        avgCost: sql<number>`coalesce(avg(${modelUsage.providerCost}), 0)::float`,
        avgLatency: sql<number>`coalesce(avg(${modelUsage.latencyMs}), 0)::float`,
        inputTokens: sql<number>`coalesce(sum(${modelUsage.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${modelUsage.outputTokens}), 0)::int`,
      })
      .from(modelUsage)
      .where(gte(modelUsage.createdAt, since))

    const byModel = await db
      .select({
        provider: modelUsage.provider,
        model: modelUsage.model,
        requests: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${modelUsage.success})::int`,
        failed: sql<number>`count(*) filter (where not ${modelUsage.success})::int`,
        totalCost: sql<number>`coalesce(sum(${modelUsage.providerCost}), 0)::float`,
        avgLatency: sql<number>`coalesce(avg(${modelUsage.latencyMs}), 0)::float`,
      })
      .from(modelUsage)
      .where(gte(modelUsage.createdAt, since))
      .groupBy(modelUsage.provider, modelUsage.model)
      .orderBy(sql`count(*) desc`)

    const errorsByModel = await db
      .select({
        provider: modelUsage.provider,
        model: modelUsage.model,
        errorType: modelUsage.errorType,
        count: sql<number>`count(*)::int`,
      })
      .from(modelUsage)
      .where(and(gte(modelUsage.createdAt, since), sql`not ${modelUsage.success}`))
      .groupBy(modelUsage.provider, modelUsage.model, modelUsage.errorType)
      .orderBy(sql`count(*) desc`)

    return NextResponse.json({
      range,
      since: since.toISOString(),
      totals: {
        totalRequests: totals?.total ?? 0,
        successful: totals?.successful ?? 0,
        failed: totals?.failed ?? 0,
        totalProviderCost: totals?.totalCost ?? 0,
        avgProviderCost: totals?.avgCost ?? 0,
        avgLatencyMs: totals?.avgLatency ?? 0,
        inputTokens: totals?.inputTokens ?? 0,
        outputTokens: totals?.outputTokens ?? 0,
        errorRate:
          totals?.total ? ((totals.failed ?? 0) / totals.total) * 100 : 0,
      },
      byModel,
      errorsByModel,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load overview'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
