import type { ConfidenceLabel, GeoLocationGuess, GeoLocationResult } from './types'
import { GatewayError } from './types'

const CONFIDENCE: ConfidenceLabel[] = ['Very High', 'High', 'Medium', 'Low', 'Very Low']

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : undefined
  }
  if (value === null || value === undefined) return undefined
  return String(value)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function normalizeConfidence(value: unknown): ConfidenceLabel {
  if (typeof value === 'string') {
    const match = CONFIDENCE.find((c) => c.toLowerCase() === value.trim().toLowerCase())
    if (match) return match
  }
  if (typeof value === 'number') {
    if (value >= 0.9) return 'Very High'
    if (value >= 0.75) return 'High'
    if (value >= 0.5) return 'Medium'
    if (value >= 0.25) return 'Low'
    return 'Very Low'
  }
  return 'Medium'
}

function composeLocation(city?: string, region?: string, country?: string, fallback?: string): string {
  const parts = [city, region, country].filter(Boolean) as string[]
  if (parts.length) return parts.join(', ')
  return fallback || 'Unknown'
}

function parseLocationString(location: string): { city?: string; region?: string; country: string } {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { country: 'Unknown' }
  if (parts.length === 1) return { country: parts[0] }
  if (parts.length === 2) return { city: parts[0], country: parts[1] }
  return {
    city: parts[0],
    region: parts.slice(1, -1).join(', '),
    country: parts[parts.length - 1],
  }
}

function normalizeGuess(raw: unknown): GeoLocationGuess | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const locationStr = asString(obj.location)
  const parsed = locationStr ? parseLocationString(locationStr) : { country: 'Unknown' }

  const city = asString(obj.city) ?? parsed.city
  const region = asString(obj.region) ?? parsed.region
  const country = asString(obj.country) ?? parsed.country

  let clues = { numbered: [] as string[], summary: '' }
  if (obj.clues && typeof obj.clues === 'object') {
    const c = obj.clues as Record<string, unknown>
    const numbered = Array.isArray(c.numbered)
      ? c.numbered.map((item, i) => {
          const s = asString(item) || ''
          return /^\d+\./.test(s) ? s : `${i + 1}. ${s}`
        }).filter(Boolean)
      : []
    clues = {
      numbered,
      summary: asString(c.summary) || '',
    }
  } else if (typeof obj.reasoning === 'string') {
    clues = { numbered: [], summary: obj.reasoning }
  }

  return {
    city,
    region,
    country,
    location: composeLocation(city, region, country, locationStr),
    confidence: normalizeConfidence(obj.confidence),
    latitude: asNumber(obj.latitude),
    longitude: asNumber(obj.longitude),
    clues,
  }
}

export function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
}

export function normalizeGeoLocationResult(raw: unknown, modelId?: string): GeoLocationResult {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(stripCodeFences(raw))
    } catch {
      throw new GatewayError('INVALID_MODEL_RESPONSE', 'Model returned non-JSON output', modelId)
    }
  }

  if (!data || typeof data !== 'object') {
    throw new GatewayError('INVALID_MODEL_RESPONSE', 'Model response was empty', modelId)
  }

  const obj = data as Record<string, unknown>
  const list = Array.isArray(obj.locations)
    ? obj.locations
    : Array.isArray(data)
      ? data
      : null

  if (!list) {
    throw new GatewayError('INVALID_MODEL_RESPONSE', 'Model response missing locations array', modelId)
  }

  const locations = list.map(normalizeGuess).filter((g): g is GeoLocationGuess => g !== null)

  if (locations.length === 0) {
    throw new GatewayError('INVALID_MODEL_RESPONSE', 'No valid location guesses in response', modelId)
  }

  return { locations: locations.slice(0, 3) }
}

/** Map normalized result to the public UI Location shape. */
export function toPublicLocations(result: GeoLocationResult) {
  return result.locations.map((loc) => ({
    location: loc.location,
    confidence: loc.confidence,
    clues: loc.clues,
  }))
}
