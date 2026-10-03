export type ConfidenceLabel = 'Very High' | 'High' | 'Medium' | 'Low' | 'Very Low'

export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high'
export type ImageQuality = 'low' | 'medium' | 'high'
export type ResponseFormat = 'structured_json' | 'text'
export type AnalysisMode = 'production' | 'playground' | 'benchmark'

export type GeoLocationGuess = {
  city?: string
  region?: string
  country: string
  location: string
  confidence: ConfidenceLabel
  latitude?: number
  longitude?: number
  clues: {
    numbered: string[]
    summary: string
  }
}

export type GeoLocationResult = {
  locations: GeoLocationGuess[]
}

export type ModelCapabilities = {
  vision: boolean
  temperature: boolean
  maxOutputTokens: boolean
  reasoning: boolean
  imageQuality: boolean
  structuredOutput: boolean
}

export type ModelDefinition = {
  /** Gateway model id in `provider/model` format. */
  id: string
  label: string
  enabled: boolean
  capabilities: ModelCapabilities
}

export type NormalizedModelConfig = {
  id?: string
  name?: string
  /** Gateway model id in `provider/model` format. */
  modelId: string
  prompt: string
  temperature: number
  maxOutputTokens: number
  reasoningLevel: ReasoningLevel
  imageQuality: ImageQuality
  responseFormat: ResponseFormat
}

export type TokenUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reportedCost?: number
}

export type GeoLocatorExecution = {
  requestId: string
  modelId: string
  gateway: {
    provider?: string
  }
  result: GeoLocationResult
  usage: TokenUsage
  latencyMs: number
  /** Settings that were applied vs omitted as unsupported. */
  appliedSettings: {
    temperature?: number | 'unsupported'
    maxOutputTokens?: number | 'unsupported'
    reasoningLevel?: ReasoningLevel | 'unsupported'
    imageQuality?: ImageQuality | 'unsupported'
  }
  rawResponse?: unknown
}

export type GatewayErrorType =
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_IMAGE'
  | 'INVALID_MODEL_RESPONSE'
  | 'AUTH_ERROR'
  | 'GATEWAY_ERROR'
  | 'UNSUPPORTED_CONFIGURATION'
  | 'UNKNOWN'

/** @deprecated Use GatewayErrorType — kept for transitional imports. */
export type ProviderErrorType = GatewayErrorType

export class GatewayError extends Error {
  type: GatewayErrorType
  modelId?: string

  constructor(type: GatewayErrorType, message: string, modelId?: string) {
    super(message)
    this.name = 'GatewayError'
    this.type = type
    this.modelId = modelId
  }
}

/** @deprecated Use GatewayError */
export class ProviderError extends GatewayError {
  provider: string

  constructor(type: GatewayErrorType, message: string, providerOrModelId?: string) {
    super(type, message, providerOrModelId)
    this.name = 'ProviderError'
    this.provider = providerOrModelId || 'gateway'
  }
}
