import { randomUUID } from 'crypto'
import { generateObject } from 'ai'
import { getImageGateModelConfig, isImageGateFailOpen } from '@/lib/ai/config'
import { classifyGatewayError, sanitizeErrorMessage } from '@/lib/ai/errors'
import {
  buildPrivacyGatewayOptions,
  isEndedFreeModelError,
  isZeroDataRetentionUnavailable,
  resolvePaidModelId,
} from '@/lib/ai/gateway-privacy'
import { DEFAULT_IMAGE_GATE_MODEL_ID } from '@/lib/ai/registry'
import {
  isDuplicateContentHash,
  recordContentHash,
  runDeterministicChecks,
} from './deterministic'
import { logImageGateEvent } from './log'
import { IMAGE_GATE_USER_TEXT } from './prompt'
import { rejectionCopyFor } from './rejection-copy'
import { imageGateResultSchema } from './schema'
import { normalizeGateAcceptance } from './soft-policy'
import type {
  GpsExif,
  ImageGateOutcome,
  ImageGateRejectionReason,
  ImageGateResult,
  RunImageGateOptions,
} from './types'

function configuredGateModelFallback(): string {
  const fromEnv = process.env.IMAGE_GATE_MODEL?.trim()
  if (fromEnv && fromEnv.includes('/')) return fromEnv
  return DEFAULT_IMAGE_GATE_MODEL_ID
}

function normalizeGpsExif(input: GpsExif | null | undefined): {
  gpsExifPresent: boolean
  gpsExif?: GpsExif
} {
  if (
    !input ||
    typeof input.latitude !== 'number' ||
    typeof input.longitude !== 'number' ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    return { gpsExifPresent: false }
  }
  return {
    gpsExifPresent: true,
    gpsExif: { latitude: input.latitude, longitude: input.longitude },
  }
}

function rejectedOutcome(args: {
  requestId: string
  model: string
  latencyMs: number
  rejectionReason: NonNullable<ImageGateRejectionReason>
  contentHash: string | null
  gpsExifPresent: boolean
  gpsExif?: GpsExif
  result?: ImageGateResult | null
}): ImageGateOutcome {
  const copy = rejectionCopyFor(args.rejectionReason)
  return {
    status: 'rejected',
    requestId: args.requestId,
    model: args.model,
    latencyMs: args.latencyMs,
    result: args.result ?? null,
    gateError: null,
    gpsExifPresent: args.gpsExifPresent,
    gpsExif: args.gpsExif,
    contentHash: args.contentHash,
    rejectionReason: args.rejectionReason,
    userMessage: copy,
  }
}

/**
 * Unified Image Gate: deterministic checks then Ling semantic assessment.
 * Semantic / infrastructure failures return status `gate_error` (caller continues).
 */
export async function runImageGate(options: RunImageGateOptions): Promise<ImageGateOutcome> {
  const requestId = options.requestId || randomUUID()
  const started = Date.now()
  const { gpsExifPresent, gpsExif } = normalizeGpsExif(options.gpsExif)

  // Cheap deterministic checks before any DB/config/model work.
  const det = runDeterministicChecks({
    imageBase64: options.imageBase64,
    mimeType: options.mimeType,
  })

  if (!det.ok) {
    const model = configuredGateModelFallback()
    const latencyMs = Date.now() - started
    const outcome = rejectedOutcome({
      requestId,
      model,
      latencyMs,
      rejectionReason: det.rejectionReason,
      contentHash: det.contentHash,
      gpsExifPresent,
      gpsExif,
      result: {
        accepted: false,
        imageType: 'unknown',
        sceneType: 'unknown',
        imageQuality: 'unusable',
        environmentContext: 'none',
        potentialClues: [],
        syntheticLikelihood: 'unknown',
        rejectionReason: det.rejectionReason,
        explanation: det.message,
      },
    })
    await logImageGateEvent({
      requestId,
      model,
      status: 'rejected',
      result: outcome.result,
      latencyMs,
      gateError: null,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      phase: options.phase,
    })
    return outcome
  }

  if (!options.skipDuplicateCheck) {
    const dup = await isDuplicateContentHash(det.contentHash)
    if (dup) {
      const model = configuredGateModelFallback()
      const latencyMs = Date.now() - started
      const outcome = rejectedOutcome({
        requestId,
        model,
        latencyMs,
        rejectionReason: 'duplicate_image',
        contentHash: det.contentHash,
        gpsExifPresent,
        gpsExif,
        result: {
          accepted: false,
          imageType: 'unknown',
          sceneType: 'unknown',
          imageQuality: 'usable',
          environmentContext: 'none',
          potentialClues: [],
          syntheticLikelihood: 'unknown',
          rejectionReason: 'duplicate_image',
          explanation: 'Duplicate image content detected',
        },
      })
      await logImageGateEvent({
        requestId,
        model,
        status: 'rejected',
        result: outcome.result,
        latencyMs,
        gateError: null,
        gpsExifPresent,
        gpsExif,
        contentHash: det.contentHash,
        phase: options.phase,
      })
      return outcome
    }
  }

  let config
  try {
    config = await getImageGateModelConfig()
  } catch (err) {
    const model = configuredGateModelFallback()
    const gateError = sanitizeErrorMessage(
      err instanceof Error ? err.message : 'Failed to load image gate config'
    )
    const latencyMs = Date.now() - started
    console.error(`[image_gate:${model}]`, gateError)
    await logImageGateEvent({
      requestId,
      model,
      status: 'gate_error',
      result: null,
      latencyMs,
      gateError,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      phase: options.phase,
    })
    if (isImageGateFailOpen()) {
      return {
        status: 'gate_error',
        requestId,
        model,
        latencyMs,
        result: null,
        gateError,
        gpsExifPresent,
        gpsExif,
        contentHash: det.contentHash,
        rejectionReason: null,
        userMessage: null,
      }
    }
    return {
      status: 'gate_error',
      requestId,
      model,
      latencyMs,
      result: null,
      gateError,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      rejectionReason: null,
      userMessage: {
        title: 'Gate unavailable',
        body: 'Photo checking is temporarily unavailable. Please try again shortly.',
      },
    }
  }

  let model = config.modelId

  try {
    const imagePart = {
      type: 'file' as const,
      mediaType: det.mimeType,
      data: det.buffer,
    }

    const runOnce = async (args: {
      modelId: string
      zeroDataRetention: boolean
      allowFallbackFromFree: boolean
    }) =>
      generateObject({
        model: args.modelId,
        schema: imageGateResultSchema,
        schemaName: 'ImageGateResult',
        schemaDescription: 'Image suitability assessment for visual geolocation',
        system: config.prompt,
        messages: [
          {
            role: 'user',
            content: [imagePart, { type: 'text', text: IMAGE_GATE_USER_TEXT }],
          },
        ],
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        providerOptions: {
          gateway: buildPrivacyGatewayOptions({
            tags: [`app:geolocator`, `mode:image_gate`, `phase:${options.phase}`],
            disallowPromptTraining: true,
            zeroDataRetention: args.zeroDataRetention,
            allowFallbackFromFree: args.allowFallbackFromFree,
          }),
        } as Parameters<typeof generateObject>[0]['providerOptions'],
      })

    let object
    try {
      ;({ object } = await runOnce({
        modelId: model,
        zeroDataRetention: true,
        allowFallbackFromFree: model.endsWith('-free'),
      }))
    } catch (firstErr) {
      // Hobby plans reject ZDR — retry without it.
      if (isZeroDataRetentionUnavailable(firstErr)) {
        console.warn(
          `[image_gate:${model}] ZDR not available on Hobby plan; retrying without ZDR`
        )
        try {
          ;({ object } = await runOnce({
            modelId: model,
            zeroDataRetention: false,
            allowFallbackFromFree: model.endsWith('-free'),
          }))
        } catch (secondErr) {
          // Free-tier model ids may have been retired — map to paid id + allowFallbackFromFree.
          if (isEndedFreeModelError(secondErr) && model.endsWith('-free')) {
            const paidId = resolvePaidModelId(model)
            console.warn(
              `[image_gate:${model}] Free tier ended; retrying as ${paidId} with allowFallbackFromFree`
            )
            model = paidId
            ;({ object } = await runOnce({
              modelId: paidId,
              zeroDataRetention: false,
              allowFallbackFromFree: true,
            }))
          } else {
            throw secondErr
          }
        }
      } else if (isEndedFreeModelError(firstErr) && model.endsWith('-free')) {
        const paidId = resolvePaidModelId(model)
        console.warn(
          `[image_gate:${model}] Free tier ended; retrying as ${paidId} with allowFallbackFromFree`
        )
        model = paidId
        try {
          ;({ object } = await runOnce({
            modelId: paidId,
            zeroDataRetention: true,
            allowFallbackFromFree: true,
          }))
        } catch (zdrErr) {
          if (isZeroDataRetentionUnavailable(zdrErr)) {
            ;({ object } = await runOnce({
              modelId: paidId,
              zeroDataRetention: false,
              allowFallbackFromFree: true,
            }))
          } else {
            throw zdrErr
          }
        }
      } else {
        throw firstErr
      }
    }

    const result = normalizeGateAcceptance(object as ImageGateResult)
    const latencyMs = Date.now() - started

    if (!result.accepted) {
      const reason = result.rejectionReason || 'not_real_world_photo'
      const outcome = rejectedOutcome({
        requestId,
        model,
        latencyMs,
        rejectionReason: reason,
        contentHash: det.contentHash,
        gpsExifPresent,
        gpsExif,
        result: { ...result, rejectionReason: reason },
      })
      await logImageGateEvent({
        requestId,
        model,
        status: 'rejected',
        result: outcome.result,
        latencyMs,
        gateError: null,
        gpsExifPresent,
        gpsExif,
        contentHash: det.contentHash,
        phase: options.phase,
      })
      // Record only on analyze so abandoned pre-analyze accepts don't block retries.
      if (options.phase === 'analyze') {
        await recordContentHash(det.contentHash)
      }
      return outcome
    }

    if (options.phase === 'analyze') {
      await recordContentHash(det.contentHash)
    }
    await logImageGateEvent({
      requestId,
      model,
      status: 'accepted',
      result,
      latencyMs,
      gateError: null,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      phase: options.phase,
    })

    return {
      status: 'accepted',
      requestId,
      model,
      latencyMs,
      result,
      gateError: null,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      rejectionReason: null,
      userMessage: null,
    }
  } catch (err) {
    const classified = classifyGatewayError(err, model)
    const gateError = sanitizeErrorMessage(classified.message || classified.type)
    const latencyMs = Date.now() - started

    console.error(`[image_gate:${model}]`, gateError)

    await logImageGateEvent({
      requestId,
      model,
      status: 'gate_error',
      result: null,
      latencyMs,
      gateError,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      phase: options.phase,
    })

    // Fail open by default — do not reject the user's image on infrastructure failure.
    if (isImageGateFailOpen()) {
      return {
        status: 'gate_error',
        requestId,
        model,
        latencyMs,
        result: null,
        gateError,
        gpsExifPresent,
        gpsExif,
        contentHash: det.contentHash,
        rejectionReason: null,
        userMessage: null,
      }
    }

    // Reserved for future hard-fail mode; still never claim the image is unsuitable.
    return {
      status: 'gate_error',
      requestId,
      model,
      latencyMs,
      result: null,
      gateError,
      gpsExifPresent,
      gpsExif,
      contentHash: det.contentHash,
      rejectionReason: null,
      userMessage: {
        title: 'Gate unavailable',
        body: 'Photo checking is temporarily unavailable. Please try again shortly.',
      },
    }
  }
}
