import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const modelConfigs = pgTable(
  'model_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    /** @deprecated Prefer modelId. Kept for migration compatibility. */
    provider: varchar('provider', { length: 64 }),
    /** @deprecated Prefer modelId. Kept for migration compatibility. */
    model: varchar('model', { length: 128 }),
    /** Gateway model id in `provider/model` format. */
    modelId: varchar('model_id', { length: 256 }),
    prompt: text('prompt').notNull(),
    temperature: real('temperature').notNull().default(0.2),
    maxOutputTokens: integer('max_output_tokens').notNull().default(1200),
    reasoningLevel: varchar('reasoning_level', { length: 32 }).notNull().default('medium'),
    imageQuality: varchar('image_quality', { length: 32 }).notNull().default('high'),
    responseFormat: varchar('response_format', { length: 64 }).notNull().default('structured_json'),
    isProduction: boolean('is_production').notNull().default(false),
    /** Singleton key: exactly one row may hold 'production'. */
    productionSlot: varchar('production_slot', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('model_configs_production_slot_uidx').on(table.productionSlot),
    uniqueIndex('model_configs_one_production_uidx')
      .on(table.isProduction)
      .where(sql`${table.isProduction} = true`),
  ]
)

export const modelUsage = pgTable('model_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: varchar('request_id', { length: 64 }).notNull(),
  mode: varchar('mode', { length: 32 }).notNull().default('production'),
  /** Legacy provider slug or Gateway provider prefix. */
  provider: varchar('provider', { length: 64 }),
  /** Short model name or full model id (legacy). */
  model: varchar('model', { length: 256 }),
  /** Gateway model id in `provider/model` format. */
  modelId: varchar('model_id', { length: 256 }),
  /** Actual underlying inference provider selected by Gateway, when known. */
  gatewayProvider: varchar('gateway_provider', { length: 128 }),
  modelConfigId: uuid('model_config_id').references(() => modelConfigs.id),
  temperature: real('temperature'),
  maxOutputTokens: integer('max_output_tokens'),
  reasoningLevel: varchar('reasoning_level', { length: 32 }),
  imageQuality: varchar('image_quality', { length: 32 }),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  /** Gateway/provider-reported cost in USD when available. */
  providerCost: real('provider_cost'),
  latencyMs: integer('latency_ms'),
  success: boolean('success').notNull(),
  errorType: varchar('error_type', { length: 64 }),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const playgroundRuns = pgTable('playground_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const playgroundResults = pgTable('playground_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  playgroundRunId: uuid('playground_run_id')
    .notNull()
    .references(() => playgroundRuns.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 64 }),
  model: varchar('model', { length: 256 }),
  modelId: varchar('model_id', { length: 256 }),
  gatewayProvider: varchar('gateway_provider', { length: 128 }),
  configuration: jsonb('configuration').notNull(),
  normalizedOutput: jsonb('normalized_output'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  providerCost: real('provider_cost'),
  latencyMs: integer('latency_ms'),
  success: boolean('success').notNull().default(true),
  errorType: varchar('error_type', { length: 64 }),
  errorMessage: text('error_message'),
  qualityRating: varchar('quality_rating', { length: 32 }),
  locationRating: varchar('location_rating', { length: 32 }),
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const benchmarkCases = pgTable('benchmark_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  imageUrl: text('image_url').notNull(),
  imagePathname: text('image_pathname'),
  country: varchar('country', { length: 128 }).notNull(),
  region: varchar('region', { length: 128 }),
  city: varchar('city', { length: 128 }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  difficulty: varchar('difficulty', { length: 32 }).notNull().default('medium'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const benchmarkRuns = pgTable('benchmark_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  configuration: jsonb('configuration').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const benchmarkResults = pgTable('benchmark_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  benchmarkRunId: uuid('benchmark_run_id')
    .notNull()
    .references(() => benchmarkRuns.id, { onDelete: 'cascade' }),
  benchmarkCaseId: uuid('benchmark_case_id')
    .notNull()
    .references(() => benchmarkCases.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 64 }),
  model: varchar('model', { length: 256 }),
  modelId: varchar('model_id', { length: 256 }),
  gatewayProvider: varchar('gateway_provider', { length: 128 }),
  normalizedOutput: jsonb('normalized_output'),
  countryCorrect: boolean('country_correct'),
  regionCorrect: boolean('region_correct'),
  cityCorrect: boolean('city_correct'),
  top3Correct: boolean('top3_correct'),
  latencyMs: integer('latency_ms'),
  providerCost: real('provider_cost'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  success: boolean('success').notNull().default(true),
  errorType: varchar('error_type', { length: 64 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ModelConfigRow = typeof modelConfigs.$inferSelect
export type ModelUsageRow = typeof modelUsage.$inferSelect
export type PlaygroundResultRow = typeof playgroundResults.$inferSelect
export type BenchmarkCaseRow = typeof benchmarkCases.$inferSelect
export type BenchmarkResultRow = typeof benchmarkResults.$inferSelect
