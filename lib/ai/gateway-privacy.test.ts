import { describe, expect, it } from 'vitest'
import {
  buildPrivacyGatewayOptions,
  isEndedFreeModelError,
  isZeroDataRetentionUnavailable,
  resolvePaidModelId,
} from './gateway-privacy'

describe('gateway-privacy', () => {
  it('detects Hobby ZDR rejections', () => {
    expect(
      isZeroDataRetentionUnavailable(
        new Error(
          'Zero Data Retention (ZDR) is only available for Pro and Enterprise plans. Current plan: hobby.'
        )
      )
    ).toBe(true)
    expect(isZeroDataRetentionUnavailable(new Error('rate limit'))).toBe(false)
  })

  it('detects ended free-tier model errors', () => {
    expect(
      isEndedFreeModelError(
        new Error(
          "Model 'inclusionai/ling-3.0-flash-vl-free' not found. If you were using its free tier, that has ended. Use allowFallbackFromFree: true"
        )
      )
    ).toBe(true)
  })

  it('maps free model ids to paid counterparts', () => {
    expect(resolvePaidModelId('inclusionai/ling-3.0-flash-vl-free')).toBe(
      'inclusionai/ling-3.0-flash-vl'
    )
    expect(resolvePaidModelId('google/gemini-3.1-flash-lite')).toBe(
      'google/gemini-3.1-flash-lite'
    )
  })

  it('builds privacy gateway options without ZDR by default', () => {
    expect(buildPrivacyGatewayOptions({ tags: ['app:geolocator'] })).toEqual({
      tags: ['app:geolocator'],
      disallowPromptTraining: true,
    })
    expect(
      buildPrivacyGatewayOptions({
        zeroDataRetention: true,
        allowFallbackFromFree: true,
      })
    ).toEqual({
      disallowPromptTraining: true,
      zeroDataRetention: true,
      allowFallbackFromFree: true,
    })
  })
})
