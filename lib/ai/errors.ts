import { APICallError } from 'ai'
import { GatewayError, type GatewayErrorType } from './types'

export function classifyGatewayError(err: unknown, modelId?: string): GatewayError {
  if (err instanceof GatewayError) return err

  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()

  let status: number | undefined
  if (APICallError.isInstance(err)) {
    status = err.statusCode
  } else if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    status = Number((err as { statusCode?: number }).statusCode)
  } else if (typeof err === 'object' && err !== null && 'status' in err) {
    status = Number((err as { status?: number }).status)
  }

  let type: GatewayErrorType = 'GATEWAY_ERROR'

  if (status === 402 || lower.includes('budget') || lower.includes('payment required')) {
    type = 'BUDGET_EXCEEDED'
  } else if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication') ||
    lower.includes('oidc')
  ) {
    type = 'AUTH_ERROR'
  } else if (status === 429 || lower.includes('rate limit') || lower.includes('quota')) {
    type = 'RATE_LIMITED'
  } else if (
    status === 404 ||
    status === 503 ||
    lower.includes('model not found') ||
    lower.includes('unavailable') ||
    lower.includes('no such model')
  ) {
    type = 'MODEL_UNAVAILABLE'
  } else if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')) {
    type = 'TIMEOUT'
  } else if (
    lower.includes('image') &&
    (lower.includes('invalid') || lower.includes('unsupported') || lower.includes('corrupt'))
  ) {
    type = 'INVALID_IMAGE'
  } else if (
    lower.includes('json') ||
    lower.includes('parse') ||
    lower.includes('invalid response') ||
    lower.includes('locations') ||
    lower.includes('schema') ||
    lower.includes('no object generated') ||
    lower.includes('type validation')
  ) {
    type = 'INVALID_MODEL_RESPONSE'
  } else if (lower.includes('unsupported')) {
    type = 'UNSUPPORTED_CONFIGURATION'
  } else if (!status && !lower.includes('gateway')) {
    type = 'UNKNOWN'
  }

  return new GatewayError(type, sanitizeErrorMessage(message), modelId)
}

/** @deprecated Use classifyGatewayError */
export function classifyProviderError(err: unknown, providerOrModelId?: string): GatewayError {
  return classifyGatewayError(err, providerOrModelId)
}

/** Strip anything that looks like a secret from error messages. */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(api[_-]?key|token|secret|authorization|bearer)\s*[:=]\s*['"]?[^\s'"]+/gi, '$1=[REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .slice(0, 500)
}

export function adminFacingError(type: GatewayErrorType): string {
  switch (type) {
    case 'AUTH_ERROR':
      return 'Authentication failed — check AI Gateway credentials'
    case 'RATE_LIMITED':
      return 'Rate limit exceeded'
    case 'BUDGET_EXCEEDED':
      return 'AI Gateway budget exceeded'
    case 'MODEL_UNAVAILABLE':
      return 'Model is unavailable'
    case 'TIMEOUT':
      return 'Request timed out'
    case 'INVALID_IMAGE':
      return 'Invalid or unsupported image'
    case 'INVALID_MODEL_RESPONSE':
      return 'Model returned an invalid response'
    case 'UNSUPPORTED_CONFIGURATION':
      return 'Unsupported configuration for this model'
    case 'GATEWAY_ERROR':
      return 'AI Gateway request failed'
    case 'UNKNOWN':
    default:
      return 'Request failed'
  }
}

export function publicFacingError(type: GatewayErrorType): string {
  if (type === 'BUDGET_EXCEEDED' || type === 'RATE_LIMITED' || type === 'MODEL_UNAVAILABLE') {
    return 'AI analysis is temporarily unavailable. Please try again later.'
  }
  return 'Analysis failed'
}
