'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type OverviewData = {
  range: string
  costSource?: string
  totals: {
    totalRequests: number
    successful: number
    failed: number
    totalProviderCost: number
    avgProviderCost: number
    avgLatencyMs: number
    inputTokens: number
    outputTokens: number
    errorRate: number
  }
  byModel: Array<{
    modelId?: string
    provider: string | null
    model: string | null
    gatewayProvider?: string | null
    requests: number
    successful: number
    failed: number
    totalCost: number
    avgLatency: number
  }>
  errorsByModel: Array<{
    modelId?: string
    provider: string | null
    model: string | null
    errorType: string | null
    count: number
  }>
}

function modelLabel(row: { modelId?: string | null; provider?: string | null; model?: string | null }) {
  return row.modelId || [row.provider, row.model].filter(Boolean).join('/') || 'unknown'
}

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

function formatUsd(n: number) {
  if (!n) return '—'
  return `$${n.toFixed(4)}`
}

function formatMs(n: number) {
  if (!n) return '—'
  return `${(n / 1000).toFixed(1)} s`
}

export default function AdminOverviewPage() {
  const [range, setRange] = useState('7d')
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    fetch(`/api/admin/overview?range=${range}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load')
        if (!cancelled) {
          setData(json)
          setError('')
          setLoading(false)
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [range])

  const totalRequests = data?.totals.totalRequests ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Operations</h1>
          <p className="text-sm text-muted-foreground">
            Production model usage and Gateway-reported cost overview
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={range === r.id ? 'default' : 'outline'}
              onClick={() => {
                if (r.id === range) return
                setLoading(true)
                setRange(r.id)
              }}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Requests" value={String(data.totals.totalRequests)} />
            <Stat title="Reported AI cost" value={formatUsd(data.totals.totalProviderCost)} />
            <Stat title="Average latency" value={formatMs(data.totals.avgLatencyMs)} />
            <Stat title="Error rate" value={`${data.totals.errorRate.toFixed(1)}%`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Successful" value={String(data.totals.successful)} />
            <Stat title="Failed" value={String(data.totals.failed)} />
            <Stat title="Input tokens" value={data.totals.inputTokens.toLocaleString()} />
            <Stat title="Output tokens" value={data.totals.outputTokens.toLocaleString()} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage by model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.byModel.length === 0 ? (
                <p className="text-sm text-muted-foreground">No production requests in this range.</p>
              ) : (
                data.byModel.map((row) => {
                  const pct = totalRequests ? (row.requests / totalRequests) * 100 : 0
                  const label = modelLabel(row)
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{label}</span>
                        <span className="text-muted-foreground">
                          {row.requests} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div
                          className="h-2 rounded bg-foreground/70"
                          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Reported cost {formatUsd(row.totalCost)}</span>
                        <span>Avg latency {formatMs(row.avgLatency)}</span>
                        <span>Errors {row.failed}</span>
                        {row.gatewayProvider ? (
                          <span>Via {row.gatewayProvider}</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost & latency by model</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Model</th>
                      <th className="py-2 pr-3 font-medium">Requests</th>
                      <th className="py-2 pr-3 font-medium">Cost</th>
                      <th className="py-2 pr-3 font-medium">Avg latency</th>
                      <th className="py-2 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((row) => (
                      <tr key={`tbl-${modelLabel(row)}`} className="border-b border-border/60">
                        <td className="py-2 pr-3">{modelLabel(row)}</td>
                        <td className="py-2 pr-3">{row.requests}</td>
                        <td className="py-2 pr-3">{formatUsd(row.totalCost)}</td>
                        <td className="py-2 pr-3">{formatMs(row.avgLatency)}</td>
                        <td className="py-2">{row.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {data.errorsByModel.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Errors by model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.errorsByModel.map((row, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>
                      {modelLabel(row)} — {row.errorType || 'UNKNOWN'}
                    </span>
                    <span className="text-muted-foreground">{row.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}
