import { eq } from 'drizzle-orm'
import { getReadyDb } from '@/lib/db'
import { modelConfigs, type ModelConfigRow } from '@/lib/db/schema'
import { DEFAULT_GEOLOCATION_PROMPT } from './default-prompt'
import { DEFAULT_IMAGE_GATE_PROMPT } from '@/lib/image-gate/prompt'
import {
  DEFAULT_IMAGE_GATE_MODEL_ID,
  DEFAULT_PRODUCTION_MODEL_ID,
  splitModelId,
  toGatewayModelId,
} from './registry'
import type {
  ImageQuality,
  NormalizedModelConfig,
  ReasoningLevel,
  ResponseFormat,
} from './types'

export const PRODUCTION_SLOT = 'production'
export const IMAGE_GATE_SLOT = 'image_gate'

/** Env override for the Image Gate model; never silently swapped to a paid model. */
export function defaultImageGateModelId(): string {
  const fromEnv = process.env.IMAGE_GATE_MODEL?.trim()
  if (fromEnv && fromEnv.includes('/')) return fromEnv
  return DEFAULT_IMAGE_GATE_MODEL_ID
}

/** MVP default: gate infrastructure failures continue to geolocation. */
export function isImageGateFailOpen(): boolean {
  const raw = process.env.IMAGE_GATE_FAIL_OPEN
  if (raw === undefined || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false' && raw.toLowerCase() !== 'off'
}

export function rowToConfig(row: ModelConfigRow): NormalizedModelConfig {
  const modelId =
    row.modelId ||
    toGatewayModelId(row.provider, row.model) ||
    DEFAULT_PRODUCTION_MODEL_ID

  return {
    id: row.id,
    name: row.name,
    modelId,
    prompt: row.prompt,
    temperature: row.temperature,
    maxOutputTokens: row.maxOutputTokens,
    reasoningLevel: row.reasoningLevel as ReasoningLevel,
    imageQuality: row.imageQuality as ImageQuality,
    responseFormat: row.responseFormat as ResponseFormat,
  }
}

async function selectProductionRow(): Promise<ModelConfigRow | undefined> {
  const db = await getReadyDb()
  const bySlot = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.productionSlot, PRODUCTION_SLOT))
    .limit(1)
  if (bySlot[0]) return bySlot[0]

  const byFlag = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.isProduction, true))
    .limit(1)
  return byFlag[0]
}

/** Ensure legacy rows have model_id populated. */
async function backfillModelId(row: ModelConfigRow): Promise<ModelConfigRow> {
  if (row.modelId) return row
  const modelId = toGatewayModelId(row.provider, row.model)
  const { provider, model } = splitModelId(modelId)
  const db = await getReadyDb()
  const [updated] = await db
    .update(modelConfigs)
    .set({
      modelId,
      provider,
      model,
      updatedAt: new Date(),
    })
    .where(eq(modelConfigs.id, row.id))
    .returning()
  return updated || { ...row, modelId, provider, model }
}

export async function ensureProductionConfig(): Promise<NormalizedModelConfig> {
  const existing = await selectProductionRow()
  if (existing) {
    if (!existing.productionSlot) {
      const db = await getReadyDb()
      await db
        .update(modelConfigs)
        .set({ productionSlot: PRODUCTION_SLOT, isProduction: true, updatedAt: new Date() })
        .where(eq(modelConfigs.id, existing.id))
    }
    const backfilled = await backfillModelId(existing)
    return rowToConfig(backfilled)
  }

  const db = await getReadyDb()
  const { provider, model } = splitModelId(DEFAULT_PRODUCTION_MODEL_ID)
  try {
    const [created] = await db
      .insert(modelConfigs)
      .values({
        name: 'Production',
        provider,
        model,
        modelId: DEFAULT_PRODUCTION_MODEL_ID,
        prompt: DEFAULT_GEOLOCATION_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 1200,
        reasoningLevel: 'medium',
        imageQuality: 'high',
        responseFormat: 'structured_json',
        isProduction: true,
        productionSlot: PRODUCTION_SLOT,
      })
      .onConflictDoNothing({ target: modelConfigs.productionSlot })
      .returning()

    if (created) return rowToConfig(created)
  } catch {
    // Unique race: another request inserted first — fall through to re-select.
  }

  const afterRace = await selectProductionRow()
  if (!afterRace) {
    throw new Error('Failed to create or load production model config')
  }
  return rowToConfig(await backfillModelId(afterRace))
}

export async function getProductionModelConfig(): Promise<NormalizedModelConfig> {
  return ensureProductionConfig()
}

export type ProductionConfigUpdate = {
  name?: string
  modelId: string
  prompt: string
  temperature: number
  maxOutputTokens: number
  reasoningLevel: ReasoningLevel
  imageQuality: ImageQuality
  responseFormat?: ResponseFormat
}

export async function saveProductionModelConfig(
  update: ProductionConfigUpdate
): Promise<NormalizedModelConfig> {
  const db = await getReadyDb()
  const current = await selectProductionRow()
  const { provider, model } = splitModelId(update.modelId)
  const responseFormat = update.responseFormat || 'structured_json'

  if (current) {
    const [updated] = await db
      .update(modelConfigs)
      .set({
        name: update.name ?? current.name,
        provider,
        model,
        modelId: update.modelId,
        prompt: update.prompt,
        temperature: update.temperature,
        maxOutputTokens: update.maxOutputTokens,
        reasoningLevel: update.reasoningLevel,
        imageQuality: update.imageQuality,
        responseFormat,
        isProduction: true,
        productionSlot: PRODUCTION_SLOT,
        updatedAt: new Date(),
      })
      .where(eq(modelConfigs.id, current.id))
      .returning()
    return rowToConfig(updated)
  }

  const [upserted] = await db
    .insert(modelConfigs)
    .values({
      name: update.name ?? 'Production',
      provider,
      model,
      modelId: update.modelId,
      prompt: update.prompt,
      temperature: update.temperature,
      maxOutputTokens: update.maxOutputTokens,
      reasoningLevel: update.reasoningLevel,
      imageQuality: update.imageQuality,
      responseFormat,
      isProduction: true,
      productionSlot: PRODUCTION_SLOT,
    })
    .onConflictDoUpdate({
      target: modelConfigs.productionSlot,
      set: {
        name: update.name ?? 'Production',
        provider,
        model,
        modelId: update.modelId,
        prompt: update.prompt,
        temperature: update.temperature,
        maxOutputTokens: update.maxOutputTokens,
        reasoningLevel: update.reasoningLevel,
        imageQuality: update.imageQuality,
        responseFormat,
        isProduction: true,
        updatedAt: new Date(),
      },
    })
    .returning()

  return rowToConfig(upserted)
}

async function selectImageGateRow(): Promise<ModelConfigRow | undefined> {
  const db = await getReadyDb()
  const rows = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.productionSlot, IMAGE_GATE_SLOT))
    .limit(1)
  return rows[0]
}

export async function ensureImageGateConfig(): Promise<NormalizedModelConfig> {
  const existing = await selectImageGateRow()
  if (existing) {
    const backfilled = await backfillModelId(existing)
    return rowToConfig(backfilled)
  }

  const db = await getReadyDb()
  const modelId = defaultImageGateModelId()
  const { provider, model } = splitModelId(modelId)
  try {
    const [created] = await db
      .insert(modelConfigs)
      .values({
        name: 'Image Gate',
        provider,
        model,
        modelId,
        prompt: DEFAULT_IMAGE_GATE_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 400,
        reasoningLevel: 'none',
        imageQuality: 'high',
        responseFormat: 'structured_json',
        isProduction: false,
        productionSlot: IMAGE_GATE_SLOT,
      })
      .onConflictDoNothing({ target: modelConfigs.productionSlot })
      .returning()

    if (created) return rowToConfig(created)
  } catch {
    // Unique race — fall through.
  }

  const afterRace = await selectImageGateRow()
  if (!afterRace) {
    throw new Error('Failed to create or load image gate model config')
  }
  return rowToConfig(await backfillModelId(afterRace))
}

export async function getImageGateModelConfig(): Promise<NormalizedModelConfig> {
  return ensureImageGateConfig()
}

export type ImageGateConfigUpdate = {
  name?: string
  modelId: string
  prompt: string
  temperature?: number
  maxOutputTokens?: number
}

export async function saveImageGateModelConfig(
  update: ImageGateConfigUpdate
): Promise<NormalizedModelConfig> {
  const db = await getReadyDb()
  const current = await selectImageGateRow()
  const { provider, model } = splitModelId(update.modelId)
  const temperature = update.temperature ?? 0.1
  const maxOutputTokens = update.maxOutputTokens ?? 400

  if (current) {
    const [updated] = await db
      .update(modelConfigs)
      .set({
        name: update.name ?? current.name,
        provider,
        model,
        modelId: update.modelId,
        prompt: update.prompt,
        temperature,
        maxOutputTokens,
        reasoningLevel: 'none',
        imageQuality: 'high',
        responseFormat: 'structured_json',
        isProduction: false,
        productionSlot: IMAGE_GATE_SLOT,
        updatedAt: new Date(),
      })
      .where(eq(modelConfigs.id, current.id))
      .returning()
    return rowToConfig(updated)
  }

  const [upserted] = await db
    .insert(modelConfigs)
    .values({
      name: update.name ?? 'Image Gate',
      provider,
      model,
      modelId: update.modelId,
      prompt: update.prompt,
      temperature,
      maxOutputTokens,
      reasoningLevel: 'none',
      imageQuality: 'high',
      responseFormat: 'structured_json',
      isProduction: false,
      productionSlot: IMAGE_GATE_SLOT,
    })
    .onConflictDoUpdate({
      target: modelConfigs.productionSlot,
      set: {
        name: update.name ?? 'Image Gate',
        provider,
        model,
        modelId: update.modelId,
        prompt: update.prompt,
        temperature,
        maxOutputTokens,
        reasoningLevel: 'none',
        isProduction: false,
        updatedAt: new Date(),
      },
    })
    .returning()

  return rowToConfig(upserted)
}
