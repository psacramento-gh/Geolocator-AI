export type ImageGateImageType =
  | 'real_photo'
  | 'illustration'
  | 'screenshot'
  | 'document'
  | 'map'
  | 'meme'
  | 'render'
  | 'synthetic'
  | 'unknown'

export type ImageGateSceneType =
  | 'urban_outdoor'
  | 'rural_outdoor'
  | 'natural_landscape'
  | 'indoor'
  | 'close_up'
  | 'mixed'
  | 'unknown'

export type ImageGateImageQuality = 'good' | 'usable' | 'poor' | 'unusable'

export type ImageGateEnvironmentContext = 'high' | 'medium' | 'low' | 'none'

export type ImageGateSyntheticLikelihood = 'low' | 'medium' | 'high' | 'unknown'

export type ImageGateRejectionReason =
  | 'not_real_world_photo'
  | 'screenshot'
  | 'illustration'
  | 'document'
  | 'map'
  | 'render'
  | 'insufficient_context'
  | 'extreme_close_up'
  | 'image_quality'
  | 'unusable_image'
  | 'unsupported_format'
  | 'file_too_large'
  | 'dimensions_too_small'
  | 'corrupt_image'
  | 'duplicate_image'
  | null

export type ImageGateResult = {
  accepted: boolean
  imageType: ImageGateImageType
  sceneType: ImageGateSceneType
  imageQuality: ImageGateImageQuality
  environmentContext: ImageGateEnvironmentContext
  potentialClues: string[]
  syntheticLikelihood: ImageGateSyntheticLikelihood
  rejectionReason: ImageGateRejectionReason
  explanation: string
}

export type GpsExif = {
  latitude: number
  longitude: number
}

export type ImageGatePhase = 'pre_analyze' | 'analyze'

export type ImageGateStatus = 'accepted' | 'rejected' | 'gate_error'

export type ImageGateOutcome = {
  status: ImageGateStatus
  requestId: string
  model: string
  latencyMs: number
  result: ImageGateResult | null
  gateError: string | null
  gpsExifPresent: boolean
  gpsExif?: GpsExif
  contentHash: string | null
  /** Deterministic rejection reasons use the same user-facing mapping. */
  rejectionReason: ImageGateRejectionReason
  userMessage: { title: string; body: string } | null
}

export type RunImageGateOptions = {
  imageBase64: string
  mimeType: string
  phase: ImageGatePhase
  requestId?: string
  gpsExif?: GpsExif | null
  /** Skip duplicate check (e.g. analyze re-check of same image). */
  skipDuplicateCheck?: boolean
}
