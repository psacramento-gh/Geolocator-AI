'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModelCapabilities } from '@/lib/ai/types'

type ModelOption = {
  id: string
  label: string
  capabilities: ModelCapabilities
}

type ProductionPayload = {
  config: {
    modelId: string
    prompt: string
    temperature: number
    maxOutputTokens: number
    reasoningLevel: string
    imageQuality: string
    responseFormat: string
  }
  capabilities: ModelCapabilities
  models: ModelOption[]
  discovery?: { source: string; error?: string }
}

export default function ProductionAdminPage() {
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.2)
  const [maxOutputTokens, setMaxOutputTokens] = useState(1200)
  const [reasoningLevel, setReasoningLevel] = useState('medium')
  const [imageQuality, setImageQuality] = useState('high')
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null)
  const [discoveryNote, setDiscoveryNote] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/production')
      .then(async (res) => {
        const json: ProductionPayload = await res.json()
        if (!res.ok) throw new Error((json as { error?: string }).error || 'Failed to load')
        setModels(json.models || [])
        setModelId(json.config.modelId)
        setPrompt(json.config.prompt)
        setTemperature(json.config.temperature)
        setMaxOutputTokens(json.config.maxOutputTokens)
        setReasoningLevel(json.config.reasoningLevel)
        setImageQuality(json.config.imageQuality)
        setCapabilities(json.capabilities)
        if (json.discovery?.source === 'fallback') {
          setDiscoveryNote(
            json.discovery.error
              ? `Using curated model list (${json.discovery.error})`
              : 'Using curated model list'
          )
        } else {
          setDiscoveryNote('Models from AI Gateway')
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const selected = useMemo(
    () => models.find((m) => m.id === modelId) || null,
    [models, modelId]
  )

  useEffect(() => {
    if (selected) setCapabilities(selected.capabilities)
    else if (models[0] && !models.some((m) => m.id === modelId)) {
      setModelId(models[0].id)
      setCapabilities(models[0].capabilities)
    }
  }, [models, modelId, selected])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus('')
    setError('')
    try {
      const res = await fetch('/api/admin/production', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          temperature,
          maxOutputTokens,
          reasoningLevel,
          imageQuality,
          responseFormat: 'structured_json',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setStatus('Production configuration saved. New requests use this config immediately.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Production AI</h1>
        <p className="text-sm text-muted-foreground">
          Active configuration for live GeoLocator requests via Vercel AI Gateway. Changes apply
          immediately.
        </p>
        {discoveryNote ? (
          <p className="mt-1 text-xs text-muted-foreground">{discoveryNote}</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production model</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model">
                <Select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Temperature">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  disabled={!capabilities?.temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
                {!capabilities?.temperature ? (
                  <p className="text-xs text-muted-foreground">Unsupported for this model</p>
                ) : null}
              </Field>
              <Field label="Max output tokens">
                <Input
                  type="number"
                  min="100"
                  max="8000"
                  value={maxOutputTokens}
                  disabled={!capabilities?.maxOutputTokens}
                  onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
                />
              </Field>
              <Field label="Reasoning">
                <Select
                  value={reasoningLevel}
                  disabled={!capabilities?.reasoning}
                  onChange={(e) => setReasoningLevel(e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
                {!capabilities?.reasoning ? (
                  <p className="text-xs text-muted-foreground">Unsupported for this model</p>
                ) : null}
              </Field>
              <Field label="Image quality">
                <Select
                  value={imageQuality}
                  disabled={!capabilities?.imageQuality}
                  onChange={(e) => setImageQuality(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
                {!capabilities?.imageQuality ? (
                  <p className="text-xs text-muted-foreground">Unsupported for this model</p>
                ) : null}
              </Field>
              <Field label="Response format">
                <Input value="Structured JSON" disabled />
              </Field>
            </div>

            <Field label="System prompt">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={16}
                className="font-mono text-xs"
              />
            </Field>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {status ? <p className="text-sm text-emerald-600">{status}</p> : null}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
