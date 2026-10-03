import { ProviderError, type ProviderErrorType, type ProviderId } from './types'

export function classifyProviderError(err: unknown, provider: ProviderId): ProviderError {
  if (err instanceof ProviderError) return err

  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: number }).status)
      : undefined

  let type: ProviderErrorType = 'PROVIDER_ERROR'

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication') ||
    lower.includes('permission')
  ) {
    type = 'AUTHENTICATION_ERROR'
  } else if (status === 429 || lower.includes('rate limit') || lower.includes('quota')) {
    type = 'RATE_LIMIT'
  } else if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')) {
    type = 'TIMEOUT'
  } else if (
    lower.includes('json') ||
    lower.includes('parse') ||
    lower.includes('invalid response') ||
    lower.includes('locations')
  ) {
    type = 'INVALID_RESPONSE'
  } else if (lower.includes('unsupported')) {
    type = 'UNSUPPORTED_CONFIGURATION'
  }

  return new ProviderError(type, sanitizeErrorMessage(message), provider)
}

/** Strip anything that looks like a secret from error messages. */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(api[_-]?key|token|secret|authorization|bearer)\s*[:=]\s*['"]?[^\s'"]+/gi, '$1=[REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .slice(0, 500)
}

export function adminFacingError(type: ProviderErrorType): string {
  switch (type) {
    case 'AUTHENTICATION_ERROR':
      return 'Authentication failed — check the provider API key'
    case 'RATE_LIMIT':
      return 'Rate limit exceeded'
    case 'TIMEOUT':
      return 'Request timed out'
    case 'INVALID_RESPONSE':
      return 'Model returned an invalid response'
    case 'UNSUPPORTED_CONFIGURATION':
      return 'Unsupported configuration for this model'
    case 'PROVIDER_ERROR':
    default:
      return 'Provider request failed'
  }
}
