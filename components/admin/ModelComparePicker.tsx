'use client'

import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import type { ModelDefinition, ProviderId } from '@/lib/ai/types'

export type ProviderGroup = {
  id: ProviderId
  label: string
  source?: 'live' | 'fallback'
  error?: string
}

type Props = {
  label?: string
  models: ModelDefinition[]
  providers: ProviderGroup[]
  selected: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
}

export function modelKey(provider: ProviderId, id: string) {
  return `${provider}:${id}`
}

export function ModelComparePicker({
  label = 'Compare models',
  models,
  providers,
  selected,
  onChange,
}: Props) {
  const groups = useMemo(() => {
    const byProvider = new Map<ProviderId, ModelDefinition[]>()
    for (const model of models) {
      const list = byProvider.get(model.provider) || []
      list.push(model)
      byProvider.set(model.provider, list)
    }

    return providers
      .map((provider) => ({
        provider,
        models: byProvider.get(provider.id) || [],
      }))
      .filter((group) => group.models.length > 0)
  }, [models, providers])

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-4">
        {groups.map(({ provider, models: groupModels }) => (
          <div key={provider.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="text-sm font-medium">{provider.label}</h3>
              {provider.source === 'fallback' ? (
                <span className="text-xs text-muted-foreground" title={provider.error}>
                  curated list
                  {provider.error ? ' (live fetch unavailable)' : ''}
                </span>
              ) : provider.source === 'live' ? (
                <span className="text-xs text-muted-foreground">from provider</span>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupModels.map((m) => {
                const key = modelKey(m.provider, m.id)
                return (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[key])}
                      onChange={(e) =>
                        onChange({ ...selected, [key]: e.target.checked })
                      }
                    />
                    <span>{m.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
