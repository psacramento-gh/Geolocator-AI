'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { GeoLocationResult, ModelDefinition, ProviderId } from '@/lib/ai/types'

type PlayResult = {
  id: string
  provider: ProviderId
  model: string
  success: boolean
  output?: GeoLocationResult
  usage?: { inputTokens?: number; outputTokens?: number; providerReportedCost?: number }
  latencyMs?: number
  errorType?: string
  errorMessage?: string
  qualityRating: string | null
  locationRating: string | null
  adminNote: string | null
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const [, base64 = ''] = dataUrl.split(',')
      resolve({ base64, mimeType: file.type || 'image/jpeg', preview: dataUrl })
    }
    reader.readAsDataURL(file)
  })
}

export default function PlaygroundPage() {
  const [models, setModels] = useState<ModelDefinition[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState('')
  const [mimeType, setMimeType] = useState('image/jpeg')
  const [prompt, setPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.2)
  const [maxOutputTokens, setMaxOutputTokens] = useState(1200)
  const [reasoningLevel, setReasoningLevel] = useState('medium')
  const [imageQuality, setImageQuality] = useState('high')
  const [results, setResults] = useState<PlayResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/models')
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load models')
        setModels(json.models)
        setPrompt(json.defaultPrompt || '')
        setTemperature(json.defaultSettings?.temperature ?? 0.2)
        setMaxOutputTokens(json.defaultSettings?.maxOutputTokens ?? 1200)
        setReasoningLevel(json.defaultSettings?.reasoningLevel ?? 'medium')
        setImageQuality(json.defaultSettings?.imageQuality ?? 'high')
        const initial: Record<string, boolean> = {}
        for (const m of json.models as ModelDefinition[]) {
          initial[`${m.provider}:${m.id}`] = ['gemini-3.1-flash-lite-preview', 'gpt-4o-mini', 'qwen-vl-plus'].includes(m.id)
        }
        setSelected(initial)
      })
      .catch((err) => setError(err.message))
  }, [])

  const selectedModels = useMemo(
    () =>
      models
        .filter((m) => selected[`${m.provider}:${m.id}`])
        .map((m) => ({ provider: m.provider, model: m.id })),
    [models, selected]
  )

  async function onFile(file: File | null) {
    if (!file) return
    const data = await fileToBase64(file)
    setImageBase64(data.base64)
    setMimeType(data.mimeType)
    setPreview(data.preview)
  }

  async function runComparison() {
    setRunning(true)
    setError('')
    setResults([])
    try {
      const res = await fetch('/api/admin/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          mimeType,
          models: selectedModels,
          prompt,
          temperature,
          maxOutputTokens,
          reasoningLevel,
          imageQuality,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Run failed')
      setResults(json.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  async function updateEval(id: string, patch: Partial<PlayResult>) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    await fetch('/api/admin/playground', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        qualityRating: patch.qualityRating,
        locationRating: patch.locationRating,
        adminNote: patch.adminNote,
      }),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Model Playground</h1>
        <p className="text-sm text-muted-foreground">
          Send one image to multiple models with the same prompt and settings.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>Image</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Playground upload" className="mt-2 max-h-64 rounded-md border object-contain" />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Compare models</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => {
                const key = `${m.provider}:${m.id}`
                return (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[key])}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    <span>
                      {m.label}
                      <span className="ml-1 text-xs text-muted-foreground">({m.provider})</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Shared inference settings</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Temperature</Label>
                <Input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Max tokens</Label>
                <Input type="number" value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Reasoning</Label>
                <Select value={reasoningLevel} onChange={(e) => setReasoningLevel(e.target.value)}>
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Image quality</Label>
                <Select value={imageQuality} onChange={(e) => setImageQuality(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Prompt</Label>
                <Textarea rows={8} className="font-mono text-xs" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </div>
            </div>
          </details>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <Button
            onClick={runComparison}
            disabled={running || !imageBase64 || selectedModels.length < 2}
          >
            {running ? 'Running…' : 'Run comparison'}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {results.map((r) => (
            <Card key={r.id}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">
                  {r.provider} / {r.model}
                </CardTitle>
                {!r.success ? (
                  <Badge variant="danger">{r.errorMessage || r.errorType || 'Failed'}</Badge>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {r.success && r.output ? (
                  <>
                    <div className="space-y-2">
                      {r.output.locations.map((loc, i) => (
                        <div key={i} className="rounded border p-2">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium">#{i + 1} {loc.location}</span>
                            <span className="text-xs text-muted-foreground">{loc.confidence}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{loc.clues.summary}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Latency {(r.latencyMs! / 1000).toFixed(1)} s</span>
                      <span>In {r.usage?.inputTokens ?? '—'}</span>
                      <span>Out {r.usage?.outputTokens ?? '—'}</span>
                      <span>
                        Cost{' '}
                        {r.usage?.providerReportedCost != null
                          ? `$${r.usage.providerReportedCost.toFixed(4)}`
                          : '—'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowRaw(showRaw === r.id ? null : r.id)}
                    >
                      {showRaw === r.id ? 'Hide JSON' : 'Inspect JSON'}
                    </Button>
                    {showRaw === r.id ? (
                      <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]">
                        {JSON.stringify(r.output, null, 2)}
                      </pre>
                    ) : null}
                  </>
                ) : null}

                <div className="space-y-2 border-t pt-3">
                  <Label>Quality</Label>
                  <Select
                    value={r.qualityRating || ''}
                    onChange={(e) => updateEval(r.id, { qualityRating: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="good">Good</option>
                    <option value="partial">Partially correct</option>
                    <option value="bad">Bad</option>
                  </Select>
                  <Label>Location correctness</Label>
                  <Select
                    value={r.locationRating || ''}
                    onChange={(e) => updateEval(r.id, { locationRating: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="top1">Top 1 correct</option>
                    <option value="top3">Top 3 contains correct</option>
                    <option value="incorrect">Incorrect</option>
                  </Select>
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={r.adminNote || ''}
                    onChange={(e) =>
                      setResults((prev) =>
                        prev.map((x) => (x.id === r.id ? { ...x, adminNote: e.target.value } : x))
                      )
                    }
                    onBlur={(e) => updateEval(r.id, { adminNote: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
