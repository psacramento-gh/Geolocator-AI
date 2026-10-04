import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makePngBuffer, toBase64 } from './test-helpers'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateObject: vi.fn(),
  }
})

vi.mock('@/lib/ai/config', () => ({
  getImageGateModelConfig: vi.fn(async () => ({
    id: 'gate-config',
    name: 'Image Gate',
    modelId: 'inclusionai/ling-3.0-flash-vl-free',
    prompt: 'gate prompt',
    temperature: 0.1,
    maxOutputTokens: 400,
    reasoningLevel: 'none',
    imageQuality: 'high',
    responseFormat: 'structured_json',
  })),
  isImageGateFailOpen: vi.fn(() => true),
}))

vi.mock('./log', () => ({
  logImageGateEvent: vi.fn(async () => {}),
}))

vi.mock('./deterministic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./deterministic')>()
  return {
    ...actual,
    isDuplicateContentHash: vi.fn(async () => false),
    recordContentHash: vi.fn(async () => {}),
  }
})

import { generateObject } from 'ai'
import { isImageGateFailOpen } from '@/lib/ai/config'
import { runImageGate } from './run-image-gate'

describe('runImageGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isImageGateFailOpen).mockReturnValue(true)
  })

  it('rejects deterministically before calling the model', async () => {
    const outcome = await runImageGate({
      imageBase64: Buffer.from('nope').toString('base64'),
      mimeType: 'image/jpeg',
      phase: 'pre_checkout',
    })
    expect(outcome.status).toBe('rejected')
    expect(generateObject).not.toHaveBeenCalled()
    expect(outcome.userMessage?.title).toBeTruthy()
  })

  it('accepts when Ling returns an accepted structured result', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        accepted: true,
        imageType: 'real_photo',
        sceneType: 'urban_outdoor',
        imageQuality: 'good',
        environmentContext: 'high',
        potentialClues: ['architecture'],
        syntheticLikelihood: 'low',
        rejectionReason: null,
        explanation: 'Clear street scene.',
      },
    } as never)

    const buf = makePngBuffer(256, 256)
    const outcome = await runImageGate({
      imageBase64: toBase64(buf),
      mimeType: 'image/png',
      phase: 'pre_checkout',
    })

    expect(outcome.status).toBe('accepted')
    expect(outcome.result?.accepted).toBe(true)
    expect(generateObject).toHaveBeenCalledOnce()
  })

  it('rejects when Ling returns accepted=false', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        accepted: false,
        imageType: 'real_photo',
        sceneType: 'close_up',
        imageQuality: 'good',
        environmentContext: 'none',
        potentialClues: [],
        syntheticLikelihood: 'low',
        rejectionReason: 'extreme_close_up',
        explanation: 'Too close-up.',
      },
    } as never)

    const buf = makePngBuffer(256, 256)
    const outcome = await runImageGate({
      imageBase64: toBase64(buf),
      mimeType: 'image/png',
      phase: 'analyze',
      skipDuplicateCheck: true,
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejectionReason).toBe('extreme_close_up')
    expect(outcome.userMessage?.title.toLowerCase()).toContain('close-up')
  })

  it('fail-opens on model errors instead of rejecting the image', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('model timed out'))

    const buf = makePngBuffer(256, 256)
    const outcome = await runImageGate({
      imageBase64: toBase64(buf),
      mimeType: 'image/png',
      phase: 'pre_checkout',
    })

    expect(outcome.status).toBe('gate_error')
    expect(outcome.gateError).toBeTruthy()
    expect(outcome.rejectionReason).toBeNull()
  })

  it('uses the configured free gate model id', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        accepted: true,
        imageType: 'real_photo',
        sceneType: 'rural_outdoor',
        imageQuality: 'usable',
        environmentContext: 'medium',
        potentialClues: ['vegetation'],
        syntheticLikelihood: 'low',
        rejectionReason: null,
        explanation: 'Rural scene.',
      },
    } as never)

    const buf = makePngBuffer(300, 300)
    await runImageGate({
      imageBase64: toBase64(buf),
      mimeType: 'image/png',
      phase: 'pre_checkout',
    })

    expect(vi.mocked(generateObject).mock.calls[0][0].model).toBe(
      'inclusionai/ling-3.0-flash-vl-free'
    )
  })
})
