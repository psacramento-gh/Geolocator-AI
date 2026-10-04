import { describe, expect, it } from 'vitest'
import { rejectionCopyFor } from './rejection-copy'

describe('rejectionCopyFor', () => {
  it('maps insufficient context without model jargon', () => {
    const copy = rejectionCopyFor('insufficient_context')
    expect(copy.title).toMatch(/geographic context/i)
    expect(copy.body.toLowerCase()).not.toContain('ling')
    expect(copy.body.toLowerCase()).not.toContain('deterministic')
  })

  it('maps close-up', () => {
    const copy = rejectionCopyFor('extreme_close_up')
    expect(copy.title.toLowerCase()).toContain('close-up')
  })

  it('maps quality issues', () => {
    const copy = rejectionCopyFor('image_quality')
    expect(copy.title.toLowerCase()).toContain('detail')
  })

  it('maps unsupported content types to real-world photo copy', () => {
    for (const reason of ['screenshot', 'illustration', 'document', 'map', 'render'] as const) {
      const copy = rejectionCopyFor(reason)
      expect(copy.title.toLowerCase()).toContain('real-world')
    }
  })

  it('maps file issues', () => {
    const copy = rejectionCopyFor('corrupt_image')
    expect(copy.title.toLowerCase()).toContain("couldn't read")
  })
})
