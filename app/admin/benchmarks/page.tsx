'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ModelComparePicker,
  modelKey,
  type ProviderGroup,
} from '@/components/admin/ModelComparePicker'
import { DEFAULT_COMPARE_MODEL_IDS } from '@/lib/ai/registry'
import type { ModelDefinition, GeoLocationResult } from '@/lib/ai/types'

type BenchmarkCase = {
  id: string
  country: string
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  difficulty: string
  notes: string | null
  createdAt: string
}

type SummaryRow = {
  modelId?: string
  provider: string
  model: string
  samples: number
  countryAccuracy: number | null
  regionAccuracy: number | null
  cityAccuracy: number | null
  top3Accuracy: number | null
  avgLatencyMs: number | null
  avgCost: number | null
  totalCost: number | null
}

type ResultRow = {
  id: string
  benchmarkCaseId: string
  modelId?: string | null
  provider: string
  model: string
  gatewayProvider?: string | null
  normalizedOutput: GeoLocationResult | null
  countryCorrect: boolean | null
  regionCorrect: boolean | null
  cityCorrect: boolean | null
  top3Correct: boolean | null
  latencyMs: number | null
  providerCost: number | null
  success: boolean
  errorMessage: string | null
}

function pct(n: number | null) {
  if (n == null) return '—'
  return `${n.toFixed(0)}%`
}

function ms(n: number | null) {
  if (n == null) return '—'
  return `${(n / 1000).toFixed(1)} s`
}

function money(n: number | null) {
  if (n == null) return '—'
  return `$${n.toFixed(4)}`
}

function mark(v: boolean | null) {
  if (v == null) return '—'
  return v ? '✓' : '✗'
}

export default function BenchmarksPage() {
  const [cases, setCases] = useState<BenchmarkCase[]>([])
  const [models, setModels] = useState<ModelDefinition[]>([])
  const [providers, setProviders] = useState<ProviderGroup[]>([])
  const [selectedCases, setSelectedCases] = useState<Record<string, boolean>>({})
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>({})
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [results, setResults] = useState<ResultRow[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  // add form
  const [file, setFile] = useState<File | null>(null)
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [notes, setNotes] = useState('')

  async function loadCases() {
    const res = await fetch('/api/admin/benchmarks/cases')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load cases')
    setCases(json.cases)
    const sel: Record<string, boolean> = {}
    for (const c of json.cases as BenchmarkCase[]) sel[c.id] = true
    setSelectedCases(sel)
  }

  useEffect(() => {
    Promise.all([
      loadCases(),
      fetch('/api/admin/models').then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load models')
        const loaded = json.models as ModelDefinition[]
        setModels(loaded)
        setProviders((json.providers || []) as ProviderGroup[])
        const defaults = new Set<string>([
          DEFAULT_COMPARE_MODEL_IDS[0],
          DEFAULT_COMPARE_MODEL_IDS[1],
        ])
        const sel: Record<string, boolean> = {}
        for (const m of loaded) {
          sel[modelKey(m.id)] = defaults.has(m.id)
        }
        setSelectedModels(sel)
      }),
    ]).catch((err) => setError(err.message))
  }, [])

  const selectedCaseIds = useMemo(
    () => cases.filter((c) => selectedCases[c.id]).map((c) => c.id),
    [cases, selectedCases]
  )

  const modelSelections = useMemo(
    () =>
      models
        .filter((m) => selectedModels[modelKey(m.id)])
        .map((m) => ({ modelId: m.id })),
    [models, selectedModels]
  )

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Image is required')
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const form = new FormData()
      form.set('image', file)
      form.set('country', country)
      form.set('region', region)
      form.set('city', city)
      form.set('latitude', latitude)
      form.set('longitude', longitude)
      form.set('difficulty', difficulty)
      form.set('notes', notes)
      const res = await fetch('/api/admin/benchmarks/cases', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      setFile(null)
      setCountry('')
      setRegion('')
      setCity('')
      setLatitude('')
      setLongitude('')
      setNotes('')
      setStatus('Benchmark case saved.')
      await loadCases()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this benchmark case?')) return
    const res = await fetch(`/api/admin/benchmarks/cases?id=${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'Delete failed')
      return
    }
    await loadCases()
  }

  async function onRun() {
    setRunning(true)
    setError('')
    setStatus('')
    setSummary([])
    setResults([])
    setActiveCaseId(null)
    try {
      const res = await fetch('/api/admin/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: selectedCaseIds,
          models: modelSelections,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Run failed')
      setSummary(json.summary || [])
      setResults(json.results || [])
      setStatus(`Benchmark complete — ${json.results?.length || 0} results`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  const detailCase = cases.find((c) => c.id === activeCaseId) || null
  const detailResults = results.filter((r) => r.benchmarkCaseId === activeCaseId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Benchmarks</h1>
        <p className="text-sm text-muted-foreground">
          Private dataset with known locations for objective model comparison.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Benchmark images</p>
            <p className="mt-1 text-2xl font-semibold">{cases.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Selected for run</p>
            <p className="mt-1 text-2xl font-semibold">{selectedCaseIds.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Models selected</p>
            <p className="mt-1 text-2xl font-semibold">{modelSelections.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add benchmark case</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Image</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Latitude (optional)</Label>
              <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Longitude (optional)</Label>
              <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save benchmark'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dataset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No benchmark cases yet.</p>
          ) : (
            <div className="space-y-2">
              {cases.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedCases[c.id])}
                      onChange={(e) =>
                        setSelectedCases((prev) => ({ ...prev, [c.id]: e.target.checked }))
                      }
                    />
                    <span>
                      {[c.city, c.region, c.country].filter(Boolean).join(', ')}
                    </span>
                    <Badge variant="muted">{c.difficulty}</Badge>
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setActiveCaseId(c.id)}>
                      Details
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run benchmark</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelComparePicker
            label="Models"
            models={models}
            providers={providers}
            selected={selectedModels}
            onChange={setSelectedModels}
          />
          <Button
            onClick={onRun}
            disabled={running || selectedCaseIds.length === 0 || modelSelections.length === 0}
          >
            {running ? 'Running…' : 'Run benchmark'}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {status ? <p className="text-sm text-emerald-600">{status}</p> : null}

      {summary.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aggregate metrics</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Country</th>
                  <th className="py-2 pr-3">Region</th>
                  <th className="py-2 pr-3">City</th>
                  <th className="py-2 pr-3">Top 3</th>
                  <th className="py-2 pr-3">Avg latency</th>
                  <th className="py-2">Avg cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.modelId || `${row.provider}:${row.model}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">{row.modelId || `${row.provider}/${row.model}`}</td>
                    <td className="py-2 pr-3">{pct(row.countryAccuracy)}</td>
                    <td className="py-2 pr-3">{pct(row.regionAccuracy)}</td>
                    <td className="py-2 pr-3">{pct(row.cityAccuracy)}</td>
                    <td className="py-2 pr-3">{pct(row.top3Accuracy)}</td>
                    <td className="py-2 pr-3">{ms(row.avgLatencyMs)}</td>
                    <td className="py-2">{money(row.avgCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {results.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-image results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cases
              .filter((c) => results.some((r) => r.benchmarkCaseId === c.id))
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded border p-2 text-left text-sm hover:bg-muted/50"
                  onClick={() => setActiveCaseId(c.id)}
                >
                  <span>{[c.city, c.region, c.country].filter(Boolean).join(', ')}</span>
                  <span className="text-xs text-muted-foreground">Inspect</span>
                </button>
              ))}
          </CardContent>
        </Card>
      ) : null}

      {detailCase ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ground truth: {[detailCase.city, detailCase.region, detailCase.country].filter(Boolean).join(', ')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/benchmarks/image?caseId=${detailCase.id}`}
              alt="Benchmark"
              className="max-h-64 rounded border object-contain"
            />
            {detailResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results for this image in the latest run.</p>
            ) : (
              detailResults.map((r) => {
                const locs = r.normalizedOutput?.locations || []
                let verdict = 'Incorrect'
                if (r.cityCorrect || (r.cityCorrect == null && r.top3Correct && locs[0])) {
                  if (r.cityCorrect || r.regionCorrect || r.countryCorrect) verdict = 'Top 1 correct'
                }
                if (r.top3Correct && !r.cityCorrect && !r.regionCorrect) verdict = 'Top 3 correct'
                if (r.cityCorrect) verdict = 'Top 1 correct'
                else if (r.top3Correct) verdict = 'Top 3 correct'

                return (
                  <div key={r.id} className="rounded border p-3 text-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {r.modelId || `${r.provider}/${r.model}`}
                      </span>
                      <Badge variant={r.success ? 'success' : 'danger'}>
                        {r.success ? verdict : r.errorMessage || 'Failed'}
                      </Badge>
                    </div>
                    {r.gatewayProvider ? (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Inference provider: {r.gatewayProvider}
                      </p>
                    ) : null}
                    {locs.map((loc, i) => (
                      <div key={i} className="text-muted-foreground">
                        {i + 1}. {loc.location}
                      </div>
                    ))}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Country {mark(r.countryCorrect)}</span>
                      <span>Region {mark(r.regionCorrect)}</span>
                      <span>City {mark(r.cityCorrect)}</span>
                      <span>Top3 {mark(r.top3Correct)}</span>
                      <span>{ms(r.latencyMs)}</span>
                      <span>Reported {money(r.providerCost)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
