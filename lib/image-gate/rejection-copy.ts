import type { ImageGateRejectionReason } from './types'

export type RejectionCopy = {
  title: string
  body: string
}

const INSUFFICIENT: RejectionCopy = {
  title: 'Not enough geographic context',
  body: 'Try a wider photo showing more of the surroundings, such as streets, buildings, signs or landscape.',
}

const CLOSE_UP: RejectionCopy = {
  title: 'This photo is too close-up',
  body: 'Try uploading an image that shows more of the surrounding environment.',
}

const QUALITY: RejectionCopy = {
  title: "We can't see enough detail",
  body: 'Try a sharper or better-lit version of the photo.',
}

const UNSUPPORTED: RejectionCopy = {
  title: "This doesn't appear to be a suitable real-world photo",
  body: 'Geolocator works best with photographs of real places and their surroundings.',
}

const DUPLICATE: RejectionCopy = {
  title: 'This photo was already submitted',
  body: 'Try a different photo of the place you want to locate.',
}

const FILE_ISSUE: RejectionCopy = {
  title: "We couldn't read this image",
  body: 'Try another photo in JPEG, PNG, or WebP format.',
}

/**
 * Map gate rejection reasons to simple, non-technical user copy.
 * Does not expose model names or deterministic vs AI distinction.
 */
export function rejectionCopyFor(reason: ImageGateRejectionReason): RejectionCopy {
  switch (reason) {
    case 'insufficient_context':
      return INSUFFICIENT
    case 'extreme_close_up':
      return CLOSE_UP
    case 'image_quality':
    case 'unusable_image':
      return QUALITY
    case 'screenshot':
    case 'illustration':
    case 'document':
    case 'map':
    case 'render':
    case 'not_real_world_photo':
      return UNSUPPORTED
    case 'duplicate_image':
      return DUPLICATE
    case 'unsupported_format':
    case 'file_too_large':
    case 'dimensions_too_small':
    case 'corrupt_image':
      return FILE_ISSUE
    default:
      return UNSUPPORTED
  }
}
