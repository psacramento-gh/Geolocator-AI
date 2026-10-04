import { describe, expect, it } from 'vitest'
import { imageGateResultSchema } from './schema'
import cases from './fixtures/cases.json'

describe('imageGateResultSchema', () => {
  it('parses a valid accepted result', () => {
    const parsed = imageGateResultSchema.parse({
      accepted: true,
      imageType: 'real_photo',
      sceneType: 'urban_outdoor',
      imageQuality: 'good',
      environmentContext: 'high',
      potentialClues: ['architecture', 'road_markings'],
      syntheticLikelihood: 'low',
      rejectionReason: null,
      explanation: 'Clear urban environment with geographic clues.',
    })
    expect(parsed.accepted).toBe(true)
  })

  it('parses a valid rejected result', () => {
    const parsed = imageGateResultSchema.parse({
      accepted: false,
      imageType: 'real_photo',
      sceneType: 'close_up',
      imageQuality: 'good',
      environmentContext: 'none',
      potentialClues: [],
      syntheticLikelihood: 'low',
      rejectionReason: 'extreme_close_up',
      explanation: 'Close-up with almost no surrounding environment.',
    })
    expect(parsed.accepted).toBe(false)
  })

  it('rejects invalid imageType values', () => {
    expect(() =>
      imageGateResultSchema.parse({
        accepted: true,
        imageType: 'photo',
        sceneType: 'urban_outdoor',
        imageQuality: 'good',
        environmentContext: 'high',
        potentialClues: [],
        syntheticLikelihood: 'low',
        rejectionReason: null,
        explanation: 'x',
      })
    ).toThrow()
  })
})

describe('fixture catalog', () => {
  it('covers should-pass, should-reject, and borderline sets', () => {
    expect(cases.shouldPass.length).toBeGreaterThanOrEqual(14)
    expect(cases.shouldReject.length).toBeGreaterThanOrEqual(18)
    expect(cases.borderline.length).toBeGreaterThanOrEqual(10)
  })

  it('marks borderline legitimate photos as accept-biased', () => {
    for (const c of cases.borderline) {
      expect(c.expected).toBe('accept')
    }
  })
})
