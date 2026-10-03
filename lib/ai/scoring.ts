import type { GeoLocationGuess, GeoLocationResult } from './types'

function norm(value?: string | null): string {
  return (value || '').trim().toLowerCase()
}

function equalsField(a?: string | null, b?: string | null): boolean | null {
  if (!a || !b) return null
  return norm(a) === norm(b)
}

export type BenchmarkScores = {
  countryCorrect: boolean | null
  regionCorrect: boolean | null
  cityCorrect: boolean | null
  top3Correct: boolean | null
}

export type GroundTruth = {
  country: string
  region?: string | null
  city?: string | null
}

function guessMatchesCity(guess: GeoLocationGuess, gt: GroundTruth): boolean {
  if (gt.city) {
    if (guess.city && equalsField(guess.city, gt.city)) return true
    if (norm(guess.location).includes(norm(gt.city))) return true
    return false
  }
  if (gt.region) {
    if (guess.region && equalsField(guess.region, gt.region)) return true
    if (norm(guess.location).includes(norm(gt.region))) return true
    return false
  }
  return Boolean(equalsField(guess.country, gt.country))
}

export function scoreAgainstGroundTruth(
  output: GeoLocationResult | null | undefined,
  gt: GroundTruth
): BenchmarkScores {
  if (!output?.locations?.length) {
    return {
      countryCorrect: false,
      regionCorrect: gt.region ? false : null,
      cityCorrect: gt.city ? false : null,
      top3Correct: false,
    }
  }

  const top = output.locations[0]
  const countryCorrect = equalsField(top.country, gt.country) ?? false
  const regionCorrect = gt.region
    ? Boolean(
        equalsField(top.region, gt.region) ||
          norm(top.location).includes(norm(gt.region))
      )
    : null
  const cityCorrect = gt.city
    ? Boolean(
        equalsField(top.city, gt.city) ||
          norm(top.location).includes(norm(gt.city))
      )
    : null

  const top3Correct = output.locations.slice(0, 3).some((g) => guessMatchesCity(g, gt))

  return { countryCorrect, regionCorrect, cityCorrect, top3Correct }
}
