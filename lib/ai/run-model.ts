import { analyzeLocation } from './geolocator-ai-service'
import type {
  AnalysisMode,
  GeoLocatorExecution,
  NormalizedModelConfig,
} from './types'

export type RunModelOptions = {
  config: NormalizedModelConfig
  imageBase64: string
  mimeType: string
  source?: AnalysisMode
  requestId?: string
  retryCount?: number
  includeRaw?: boolean
  pinProvider?: string
  user?: string
  logUsage?: boolean
}

/**
 * Compatibility wrapper around analyzeLocation (the single AI entry point).
 * Prefer importing analyzeLocation directly in new code.
 */
export async function runModel(options: RunModelOptions): Promise<GeoLocatorExecution> {
  return analyzeLocation({
    config: options.config,
    imageBase64: options.imageBase64,
    mimeType: options.mimeType,
    mode: options.source || 'production',
    requestId: options.requestId,
    includeRaw: options.includeRaw,
    pinProvider: options.pinProvider,
    user: options.user,
    logUsage: options.logUsage,
  })
}
