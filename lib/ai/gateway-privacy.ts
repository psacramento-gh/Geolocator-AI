/**
 * Helpers for AI Gateway privacy / free-tier provider options.
 */

/** True when Gateway rejected zeroDataRetention (Hobby / unsupported plan). */
export function isZeroDataRetentionUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  return (
    lower.includes('zero data retention') ||
    lower.includes('zerodataretention') ||
    (lower.includes('zdr') && (lower.includes('hobby') || lower.includes('pro')))
  )
}

/** True when a `*-free` model id is no longer listed / free tier ended. */
export function isEndedFreeModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  return (
    lower.includes('free tier') ||
    lower.includes('allowfallbackfromfree') ||
    (lower.includes('not found') && lower.includes('-free'))
  )
}

/** Map ended free-tier model ids to their paid counterparts. */
export function resolvePaidModelId(modelId: string): string {
  if (modelId.endsWith('-free')) {
    return modelId.slice(0, -'-free'.length)
  }
  return modelId
}

export type PrivacyGatewayOptions = {
  tags?: string[]
  /** Prefer ZDR when the plan supports it (default true for production privacy). */
  zeroDataRetention?: boolean
  disallowPromptTraining?: boolean
  /** When using a retired `*-free` model id, allow paid fallback. */
  allowFallbackFromFree?: boolean
  only?: string[]
  user?: string
  has?: string[]
}

export function buildPrivacyGatewayOptions(
  opts: PrivacyGatewayOptions = {}
): Record<string, unknown> {
  const {
    tags,
    zeroDataRetention = false,
    disallowPromptTraining = true,
    allowFallbackFromFree,
    only,
    user,
    has,
  } = opts

  return {
    ...(tags ? { tags } : {}),
    ...(disallowPromptTraining ? { disallowPromptTraining: true } : {}),
    ...(zeroDataRetention ? { zeroDataRetention: true } : {}),
    ...(allowFallbackFromFree ? { allowFallbackFromFree: true } : {}),
    ...(only ? { only } : {}),
    ...(user ? { user } : {}),
    ...(has ? { has } : {}),
  }
}
