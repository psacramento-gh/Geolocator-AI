export type ConfidenceLabel = 'Very High' | 'High' | 'Medium' | 'Low' | 'Very Low'

export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high'
export type ImageQuality = 'low' | 'medium' | 'high'
export type ResponseFormat = 'structured_json' | 'text'
export type ProviderId = 'gemini' | 'openai' | 'qwen'

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
  temperature: boolean
  maxOutputTokens: boolean
  reasoning: boolean
  imageQuality: boolean
  structuredOutput: boolean
}

export type ModelDefinition = {
  id: string
  provider: ProviderId
  label: string
  capabilities: ModelCapabilities
}

export type NormalizedModelConfig = {
  id?: string
  name?: string
  provider: ProviderId
  model: string
  prompt: string
  temperature: number
  maxOutputTokens: number
  reasoningLevel: ReasoningLevel
  imageQuality: ImageQuality
  responseFormat: ResponseFormat
}

export type ModelRequest = {
  config: NormalizedModelConfig
  imageBase64: string
  mimeType: string
}

export type TokenUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  providerReportedCost?: number
}

export type ModelExecutionResult = {
  provider: ProviderId
  model: string
  output: GeoLocationResult
  usage: TokenUsage
  latencyMs: number
  rawResponse?: unknown
}

export type ProviderErrorType =
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_ERROR'
  | 'UNSUPPORTED_CONFIGURATION'

export class ProviderError extends Error {
  type: ProviderErrorType
  provider: ProviderId

  constructor(type: ProviderErrorType, message: string, provider: ProviderId) {
    super(message)
    this.name = 'ProviderError'
    this.type = type
    this.provider = provider
  }
}

export interface VisionModelProvider {
  run(request: ModelRequest): Promise<ModelExecutionResult>
}
