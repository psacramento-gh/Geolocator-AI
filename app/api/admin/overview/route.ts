import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { getReadyDb } from '@/lib/db'
import { imageGateEvents, modelUsage } from '@/lib/db/schema'
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
    const db = await getReadyDb()

    const productionOnly = and(
      gte(modelUsage.createdAt, since),
      eq(modelUsage.mode, 'production')
    )

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
      .where(productionOnly)

    const byModel = await db
      .select({
        modelId: sql<string>`coalesce(${modelUsage.modelId}, ${modelUsage.provider} || '/' || ${modelUsage.model})`,
        provider: modelUsage.provider,
        model: modelUsage.model,
        gatewayProvider: modelUsage.gatewayProvider,
        requests: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${modelUsage.success})::int`,
        failed: sql<number>`count(*) filter (where not ${modelUsage.success})::int`,
        totalCost: sql<number>`coalesce(sum(${modelUsage.providerCost}), 0)::float`,
        avgLatency: sql<number>`coalesce(avg(${modelUsage.latencyMs}), 0)::float`,
      })
      .from(modelUsage)
      .where(productionOnly)
      .groupBy(
        modelUsage.modelId,
        modelUsage.provider,
        modelUsage.model,
        modelUsage.gatewayProvider
      )
      .orderBy(sql`count(*) desc`)

    const errorsByModel = await db
      .select({
        modelId: sql<string>`coalesce(${modelUsage.modelId}, ${modelUsage.provider} || '/' || ${modelUsage.model})`,
        provider: modelUsage.provider,
        model: modelUsage.model,
        errorType: modelUsage.errorType,
        count: sql<number>`count(*)::int`,
      })
      .from(modelUsage)
      .where(and(productionOnly, sql`not ${modelUsage.success}`))
      .groupBy(modelUsage.modelId, modelUsage.provider, modelUsage.model, modelUsage.errorType)
      .orderBy(sql`count(*) desc`)

    const gateSince = gte(imageGateEvents.createdAt, since)

    const [gateTotals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        accepted: sql<number>`count(*) filter (where ${imageGateEvents.accepted} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${imageGateEvents.accepted} = false)::int`,
        errors: sql<number>`count(*) filter (where ${imageGateEvents.accepted} is null)::int`,
        avgLatency: sql<number>`coalesce(avg(${imageGateEvents.latencyMs}), 0)::float`,
      })
      .from(imageGateEvents)
      .where(gateSince)

    const rejectionBreakdown = await db
      .select({
        rejectionReason: imageGateEvents.rejectionReason,
        count: sql<number>`count(*)::int`,
      })
      .from(imageGateEvents)
      .where(
        and(
          gateSince,
          eq(imageGateEvents.accepted, false),
          isNotNull(imageGateEvents.rejectionReason)
        )
      )
      .groupBy(imageGateEvents.rejectionReason)
      .orderBy(sql`count(*) desc`)

    const gateByModel = await db
      .select({
        model: imageGateEvents.model,
        requests: sql<number>`count(*)::int`,
        accepted: sql<number>`count(*) filter (where ${imageGateEvents.accepted} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${imageGateEvents.accepted} = false)::int`,
        errors: sql<number>`count(*) filter (where ${imageGateEvents.accepted} is null)::int`,
        avgLatency: sql<number>`coalesce(avg(${imageGateEvents.latencyMs}), 0)::float`,
      })
      .from(imageGateEvents)
      .where(gateSince)
      .groupBy(imageGateEvents.model)
      .orderBy(sql`count(*) desc`)

    const gateTotal = gateTotals?.total ?? 0
    const gateRejected = gateTotals?.rejected ?? 0
    const gateErrors = gateTotals?.errors ?? 0
    const gateAccepted = gateTotals?.accepted ?? 0

    return NextResponse.json({
      range,
      since: since.toISOString(),
      costSource: 'gateway_reported',
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
          totals?.total && totals.total > 0 ? (totals.failed / totals.total) * 100 : 0,
      },
      byModel,
      errorsByModel,
      imageGate: {
        totalRequests: gateTotal,
        accepted: gateAccepted,
        rejected: gateRejected,
        errors: gateErrors,
        passRate: gateTotal > 0 ? (gateAccepted / gateTotal) * 100 : 0,
        errorRate: gateTotal > 0 ? (gateErrors / gateTotal) * 100 : 0,
        avgLatencyMs: gateTotals?.avgLatency ?? 0,
        rejectionBreakdown,
        byModel: gateByModel,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load overview'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
