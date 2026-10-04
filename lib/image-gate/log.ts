import { getReadyDb } from '@/lib/db'
import { imageGateEvents } from '@/lib/db/schema'
import { sanitizeErrorMessage } from '@/lib/ai/errors'
import type { GpsExif, ImageGatePhase, ImageGateResult, ImageGateStatus } from './types'

export type ImageGateLogEntry = {
  requestId: string
  model: string
  status: ImageGateStatus
  result: ImageGateResult | null
  latencyMs: number
  gateError: string | null
  gpsExifPresent: boolean
  gpsExif?: GpsExif
  contentHash: string | null
  phase: ImageGatePhase
}

export async function logImageGateEvent(entry: ImageGateLogEntry): Promise<void> {
  try {
    const db = await getReadyDb()
    const accepted =
      entry.status === 'accepted' ? true : entry.status === 'rejected' ? false : null

    await db.insert(imageGateEvents).values({
      requestId: entry.requestId,
      model: entry.model,
      accepted,
      imageType: entry.result?.imageType ?? null,
      sceneType: entry.result?.sceneType ?? null,
      imageQuality: entry.result?.imageQuality ?? null,
      environmentContext: entry.result?.environmentContext ?? null,
      potentialClues: entry.result?.potentialClues ?? null,
      syntheticLikelihood: entry.result?.syntheticLikelihood ?? null,
      rejectionReason: entry.result?.rejectionReason ?? null,
      latencyMs: entry.latencyMs,
      gateError: entry.gateError,
      gpsExifPresent: entry.gpsExifPresent,
      gpsLatitude: entry.gpsExif?.latitude ?? null,
      gpsLongitude: entry.gpsExif?.longitude ?? null,
      contentHash: entry.contentHash,
      phase: entry.phase,
    })
  } catch (err) {
    console.error(
      '[image_gate_events] failed to persist',
      sanitizeErrorMessage(err instanceof Error ? err.message : String(err))
    )
  }
}
