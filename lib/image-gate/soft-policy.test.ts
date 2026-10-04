import { describe, expect, it } from 'vitest'
import { applySyntheticSoftPolicy, normalizeGateAcceptance } from './soft-policy'
import type { ImageGateResult } from './types'

function base(overrides: Partial<ImageGateResult> = {}): ImageGateResult {
  return {
    accepted: true,
    imageType: 'real_photo',
    sceneType: 'urban_outdoor',
    imageQuality: 'good',
    environmentContext: 'high',
    potentialClues: ['architecture'],
    syntheticLikelihood: 'low',
    rejectionReason: null,
    explanation: 'ok',
    ...overrides,
  }
}

describe('applySyntheticSoftPolicy', () => {
  it('does not hard-reject photorealistic images solely for high synthetic likelihood', () => {
    const result = applySyntheticSoftPolicy(
      base({
        accepted: false,
        syntheticLikelihood: 'high',
        rejectionReason: 'not_real_world_photo',
        environmentContext: 'high',
        imageQuality: 'good',
      })
    )
    expect(result.accepted).toBe(true)
    expect(result.rejectionReason).toBeNull()
  })

  it('leaves clear illustration rejections alone', () => {
    const result = applySyntheticSoftPolicy(
      base({
        accepted: false,
        imageType: 'illustration',
        syntheticLikelihood: 'high',
        rejectionReason: 'illustration',
        environmentContext: 'none',
      })
    )
    expect(result.accepted).toBe(false)
    expect(result.rejectionReason).toBe('illustration')
  })
})

describe('normalizeGateAcceptance', () => {
  it('clears rejectionReason when accepted', () => {
    const result = normalizeGateAcceptance(
      base({ accepted: true, rejectionReason: 'insufficient_context' })
    )
    expect(result.rejectionReason).toBeNull()
  })

  it('prefers acceptance for borderline real photos with context', () => {
    const result = normalizeGateAcceptance(
      base({
        accepted: false,
        rejectionReason: null,
        environmentContext: 'medium',
        imageQuality: 'usable',
      })
    )
    expect(result.accepted).toBe(true)
  })
})
