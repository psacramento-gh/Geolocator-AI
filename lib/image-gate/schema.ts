import { z } from 'zod'

export const imageGateResultSchema = z.object({
  accepted: z.boolean(),
  imageType: z.enum([
    'real_photo',
    'illustration',
    'screenshot',
    'document',
    'map',
    'meme',
    'render',
    'synthetic',
    'unknown',
  ]),
  sceneType: z.enum([
    'urban_outdoor',
    'rural_outdoor',
    'natural_landscape',
    'indoor',
    'close_up',
    'mixed',
    'unknown',
  ]),
  imageQuality: z.enum(['good', 'usable', 'poor', 'unusable']),
  environmentContext: z.enum(['high', 'medium', 'low', 'none']),
  potentialClues: z.array(z.string()),
  syntheticLikelihood: z.enum(['low', 'medium', 'high', 'unknown']),
  rejectionReason: z
    .enum([
      'not_real_world_photo',
      'screenshot',
      'illustration',
      'document',
      'map',
      'render',
      'insufficient_context',
      'extreme_close_up',
      'image_quality',
      'unusable_image',
    ])
    .nullable(),
  explanation: z.string(),
})

export type ParsedImageGateResult = z.infer<typeof imageGateResultSchema>
