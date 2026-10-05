/**
 * Helpers for AI Gateway privacy / free-tier provider options.
 */

/**
 * True only when Gateway rejected zeroDataRetention because the *plan*
 * does not include ZDR (Hobby). Do not match transient routing failures
 * where a Pro/Enterprise plan temporarily has no ZDR-capable provider —
 * those must fail closed so we do not silently drop privacy.
 */
export function isZeroDataRetentionUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  const mentionsZdr =
    lower.includes('zero data retention') ||
    lower.includes('zerodataretention') ||
    /\bzdr\b/.test(lower)
  if (!mentionsZdr) return false

  // Exact plan-availability shape from AI Gateway on Hobby.
  const planDenied =
    lower.includes('current plan: hobby') ||
    (lower.includes('hobby') &&
      (lower.includes('only available') ||
        lower.includes('pro and enterprise') ||
        lower.includes('upgrade your plan')))

  return planDenied
}

/**
 * True when a `*-free` model id has been permanently retired / delisted.
 * Transient free-tier rate limits or quota exhaustion must NOT trigger a
 * paid-model fallback.
 */
export function isEndedFreeModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()

  const endedSignal =
    lower.includes('has ended') ||
    lower.includes('free tier, that has ended') ||
    lower.includes('free tier has ended') ||
    lower.includes('no longer available') ||
    lower.includes('retired')

  const notFoundFreeId =
    (lower.includes('not found') || lower.includes('no such model')) &&
    lower.includes('-free')

  // Gateway's documented retirement hint for former free ids.
  const allowFallbackHint =
    lower.includes('allowfallbackfromfree') &&
    (endedSignal || notFoundFreeId || lower.includes('paid'))

  return (endedSignal && (lower.includes('free tier') || notFoundFreeId)) || allowFallbackHint
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
