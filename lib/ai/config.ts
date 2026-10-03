import { eq } from 'drizzle-orm'
import { getReadyDb } from '@/lib/db'
import { modelConfigs, type ModelConfigRow } from '@/lib/db/schema'
import { DEFAULT_GEOLOCATION_PROMPT } from './default-prompt'
import type {
  ImageQuality,
  NormalizedModelConfig,
  ProviderId,
  ReasoningLevel,
  ResponseFormat,
} from './types'

export const PRODUCTION_SLOT = 'production'

export function rowToConfig(row: ModelConfigRow): NormalizedModelConfig {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as ProviderId,
    model: row.model,
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

export async function ensureProductionConfig(): Promise<NormalizedModelConfig> {
  const existing = await selectProductionRow()
  if (existing) {
    // Backfill singleton slot if an older row only has isProduction.
    if (!existing.productionSlot) {
      const db = await getReadyDb()
      await db
        .update(modelConfigs)
        .set({ productionSlot: PRODUCTION_SLOT, isProduction: true, updatedAt: new Date() })
        .where(eq(modelConfigs.id, existing.id))
    }
    return rowToConfig(existing)
  }

  const db = await getReadyDb()
  try {
    const [created] = await db
      .insert(modelConfigs)
      .values({
        name: 'Production',
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite-preview',
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
  return rowToConfig(afterRace)
}

export async function getProductionModelConfig(): Promise<NormalizedModelConfig> {
  return ensureProductionConfig()
}

export type ProductionConfigUpdate = {
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

export async function saveProductionModelConfig(
  update: ProductionConfigUpdate
): Promise<NormalizedModelConfig> {
  const db = await getReadyDb()
  const current = await selectProductionRow()

  if (current) {
    const [updated] = await db
      .update(modelConfigs)
      .set({
        name: update.name ?? current.name,
        provider: update.provider,
        model: update.model,
        prompt: update.prompt,
        temperature: update.temperature,
        maxOutputTokens: update.maxOutputTokens,
        reasoningLevel: update.reasoningLevel,
        imageQuality: update.imageQuality,
        responseFormat: update.responseFormat,
        isProduction: true,
        productionSlot: PRODUCTION_SLOT,
        updatedAt: new Date(),
      })
      .where(eq(modelConfigs.id, current.id))
      .returning()
    return rowToConfig(updated)
  }

  // Atomic upsert on the singleton production slot.
  const [upserted] = await db
    .insert(modelConfigs)
    .values({
      name: update.name ?? 'Production',
      provider: update.provider,
      model: update.model,
      prompt: update.prompt,
      temperature: update.temperature,
      maxOutputTokens: update.maxOutputTokens,
      reasoningLevel: update.reasoningLevel,
      imageQuality: update.imageQuality,
      responseFormat: update.responseFormat,
      isProduction: true,
      productionSlot: PRODUCTION_SLOT,
    })
    .onConflictDoUpdate({
      target: modelConfigs.productionSlot,
      set: {
        name: update.name ?? 'Production',
        provider: update.provider,
        model: update.model,
        prompt: update.prompt,
        temperature: update.temperature,
        maxOutputTokens: update.maxOutputTokens,
        reasoningLevel: update.reasoningLevel,
        imageQuality: update.imageQuality,
        responseFormat: update.responseFormat,
        isProduction: true,
        updatedAt: new Date(),
      },
    })
    .returning()

  return rowToConfig(upserted)
}
