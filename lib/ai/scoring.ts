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

function countryMatches(guess: GeoLocationGuess, gt: GroundTruth): boolean {
  if (equalsField(guess.country, gt.country)) return true
  return norm(guess.location).includes(norm(gt.country))
}

function regionMatches(guess: GeoLocationGuess, gt: GroundTruth): boolean {
  if (!gt.region) return true
  if (equalsField(guess.region, gt.region)) return true
  return norm(guess.location).includes(norm(gt.region))
}

function cityMatches(guess: GeoLocationGuess, gt: GroundTruth): boolean {
  if (!gt.city) return true
  if (equalsField(guess.city, gt.city)) return true
  return norm(guess.location).includes(norm(gt.city))
}

/** A guess matches ground truth only when country (and region/city when present) all agree. */
function guessMatchesLocation(guess: GeoLocationGuess, gt: GroundTruth): boolean {
  if (!countryMatches(guess, gt)) return false
  if (!regionMatches(guess, gt)) return false
  if (!cityMatches(guess, gt)) return false
  return true
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
  const countryCorrect = countryMatches(top, gt)
  const regionCorrect = gt.region ? regionMatches(top, gt) && countryCorrect : null
  const cityCorrect = gt.city ? cityMatches(top, gt) && countryCorrect && regionMatches(top, gt) : null

  const top3Correct = output.locations.slice(0, 3).some((g) => guessMatchesLocation(g, gt))

  return { countryCorrect, regionCorrect, cityCorrect, top3Correct }
}
