import type { ImageGateResult } from './types'

/**
 * Soften over-aggressive synthetic rejection: photorealistic images with
 * useful environmental context must not be hard-rejected solely because
 * syntheticLikelihood is high.
 */
export function applySyntheticSoftPolicy(result: ImageGateResult): ImageGateResult {
  if (
    !result.accepted &&
    result.imageType === 'real_photo' &&
    (result.environmentContext === 'medium' || result.environmentContext === 'high') &&
    (result.imageQuality === 'good' || result.imageQuality === 'usable') &&
    result.syntheticLikelihood === 'high' &&
    (result.rejectionReason === 'not_real_world_photo' ||
      result.rejectionReason === 'render' ||
      result.rejectionReason === null)
  ) {
    return {
      ...result,
      accepted: true,
      rejectionReason: null,
      explanation:
        result.explanation ||
        'Photorealistic image with usable environmental context; synthetic likelihood treated as a signal only.',
    }
  }
  return result
}

/**
 * When the model leaves accepted/rejectionReason inconsistent, prefer acceptance
 * for borderline real photos (spec: bias toward letting borderline photos through).
 */
export function normalizeGateAcceptance(result: ImageGateResult): ImageGateResult {
  let next = applySyntheticSoftPolicy(result)

  if (next.accepted && next.rejectionReason) {
    next = { ...next, rejectionReason: null }
  }

  if (
    !next.accepted &&
    !next.rejectionReason &&
    next.imageType === 'real_photo' &&
    (next.environmentContext === 'medium' || next.environmentContext === 'high') &&
    (next.imageQuality === 'good' || next.imageQuality === 'usable')
  ) {
    next = {
      ...next,
      accepted: true,
      rejectionReason: null,
    }
  }

  return next
}
