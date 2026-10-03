'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModelCapabilities, ProviderId } from '@/lib/ai/types'

type ProviderOption = {
  id: ProviderId
  label: string
  models: Array<{ id: string; label: string; capabilities: ModelCapabilities }>
}

type ProductionPayload = {
  config: {
    provider: ProviderId
    model: string
    prompt: string
    temperature: number
    maxOutputTokens: number
    reasoningLevel: string
    imageQuality: string
    responseFormat: string
  }
  capabilities: ModelCapabilities
  providers: ProviderOption[]
}

export default function ProductionAdminPage() {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [provider, setProvider] = useState<ProviderId>('gemini')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.2)
  const [maxOutputTokens, setMaxOutputTokens] = useState(1200)
  const [reasoningLevel, setReasoningLevel] = useState('medium')
  const [imageQuality, setImageQuality] = useState('high')
  const [responseFormat, setResponseFormat] = useState('structured_json')
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/production')
      .then(async (res) => {
        const json: ProductionPayload = await res.json()
        if (!res.ok) throw new Error((json as { error?: string }).error || 'Failed to load')
        setProviders(json.providers)
        setProvider(json.config.provider)
        setModel(json.config.model)
        setPrompt(json.config.prompt)
        setTemperature(json.config.temperature)
        setMaxOutputTokens(json.config.maxOutputTokens)
        setReasoningLevel(json.config.reasoningLevel)
        setImageQuality(json.config.imageQuality)
        setResponseFormat(json.config.responseFormat)
        setCapabilities(json.capabilities)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const models = useMemo(
    () => providers.find((p) => p.id === provider)?.models || [],
    [providers, provider]
  )

  useEffect(() => {
    const def = models.find((m) => m.id === model)
    if (def) setCapabilities(def.capabilities)
    else if (models[0] && !models.some((m) => m.id === model)) {
      setModel(models[0].id)
      setCapabilities(models[0].capabilities)
    }
  }, [models, model])

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
          provider,
          model,
          prompt,
          temperature,
          maxOutputTokens,
          reasoningLevel,
          imageQuality,
          responseFormat,
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
          Active configuration for live GeoLocator requests. Changes apply immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production model</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider">
                <Select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId)}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Model">
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
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
              </Field>
              <Field label="Response format">
                <Select
                  value={responseFormat}
                  disabled={!capabilities?.structuredOutput}
                  onChange={(e) => setResponseFormat(e.target.value)}
                >
                  <option value="structured_json">Structured JSON</option>
                  <option value="text">Text</option>
                </Select>
              </Field>
            </div>

            <Field label="Prompt">
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
              {saving ? 'Saving…' : 'Save production configuration'}
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
