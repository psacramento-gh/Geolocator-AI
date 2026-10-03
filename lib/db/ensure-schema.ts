import { neon } from '@neondatabase/serverless'

/** Stable lock key for schema bootstrap across serverless instances. */
const SCHEMA_LOCK_KEY = 746283901

let schemaReady: Promise<void> | null = null

/**
 * Create/upgrade admin tables if needed.
 * Safe to call repeatedly — uses a transactional advisory lock + IF NOT EXISTS DDL.
 */
export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = createSchema().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  await schemaReady
}

async function createSchema(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }

  const sql = neon(url)

  // Run bootstrap in one transaction so pg_advisory_xact_lock serializes
  // concurrent cold starts across Vercel function instances.
  await sql.transaction((txn) => [
    txn`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`,

    // Neon Postgres includes gen_random_uuid(); keep this for older branches.
    txn`CREATE EXTENSION IF NOT EXISTS pgcrypto`,

    txn`
      CREATE TABLE IF NOT EXISTS model_configs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL,
        provider varchar(64),
        model varchar(256),
        model_id varchar(256),
        prompt text NOT NULL,
        temperature real NOT NULL DEFAULT 0.2,
        max_output_tokens integer NOT NULL DEFAULT 1200,
        reasoning_level varchar(32) NOT NULL DEFAULT 'medium',
        image_quality varchar(32) NOT NULL DEFAULT 'high',
        response_format varchar(64) NOT NULL DEFAULT 'structured_json',
        is_production boolean NOT NULL DEFAULT false,
        production_slot varchar(32),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`
      ALTER TABLE model_configs
      ADD COLUMN IF NOT EXISTS production_slot varchar(32)
    `,
    txn`
      ALTER TABLE model_configs
      ADD COLUMN IF NOT EXISTS is_production boolean NOT NULL DEFAULT false
    `,
    txn`
      ALTER TABLE model_configs
      ADD COLUMN IF NOT EXISTS model_id varchar(256)
    `,

    txn`
      CREATE UNIQUE INDEX IF NOT EXISTS model_configs_production_slot_uidx
      ON model_configs (production_slot)
    `,

    txn`
      CREATE UNIQUE INDEX IF NOT EXISTS model_configs_one_production_uidx
      ON model_configs (is_production)
      WHERE is_production = true
    `,

    // Backfill Gateway model_id from legacy provider+model columns.
    txn`
      UPDATE model_configs
      SET model_id = CASE
        WHEN model_id IS NOT NULL AND model_id <> '' THEN model_id
        WHEN model LIKE '%/%' THEN model
        WHEN provider = 'gemini' AND model = 'gemini-3.1-flash-lite-preview'
          THEN 'google/gemini-3.1-flash-lite'
        WHEN provider = 'gemini' OR provider = 'google'
          THEN 'google/' || model
        WHEN provider = 'openai' THEN 'openai/' || model
        WHEN provider = 'qwen' OR provider = 'alibaba' THEN
          CASE
            WHEN model IN ('qwen-vl-max', 'qwen-vl-plus', 'qwen3-vl-plus')
              THEN 'alibaba/qwen3-vl-instruct'
            ELSE 'alibaba/' || model
          END
        WHEN provider IS NOT NULL AND model IS NOT NULL THEN provider || '/' || model
        ELSE 'google/gemini-3.1-flash-lite'
      END
      WHERE model_id IS NULL OR model_id = ''
    `,

    txn`
      CREATE TABLE IF NOT EXISTS model_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id varchar(64) NOT NULL,
        mode varchar(32) NOT NULL DEFAULT 'production',
        provider varchar(64),
        model varchar(256),
        model_id varchar(256),
        gateway_provider varchar(128),
        model_config_id uuid REFERENCES model_configs(id),
        temperature real,
        max_output_tokens integer,
        reasoning_level varchar(32),
        image_quality varchar(32),
        input_tokens integer,
        output_tokens integer,
        total_tokens integer,
        provider_cost real,
        latency_ms integer,
        success boolean NOT NULL,
        error_type varchar(64),
        retry_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`ALTER TABLE model_usage ADD COLUMN IF NOT EXISTS mode varchar(32) NOT NULL DEFAULT 'production'`,
    txn`ALTER TABLE model_usage ADD COLUMN IF NOT EXISTS model_id varchar(256)`,
    txn`ALTER TABLE model_usage ADD COLUMN IF NOT EXISTS gateway_provider varchar(128)`,

    txn`
      UPDATE model_usage
      SET model_id = COALESCE(
        NULLIF(model_id, ''),
        CASE
          WHEN model LIKE '%/%' THEN model
          WHEN provider IS NOT NULL AND model IS NOT NULL THEN provider || '/' || model
          ELSE model
        END
      )
      WHERE model_id IS NULL OR model_id = ''
    `,

    txn`
      CREATE TABLE IF NOT EXISTS playground_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`
      CREATE TABLE IF NOT EXISTS playground_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        playground_run_id uuid NOT NULL REFERENCES playground_runs(id) ON DELETE CASCADE,
        provider varchar(64),
        model varchar(256),
        model_id varchar(256),
        gateway_provider varchar(128),
        configuration jsonb NOT NULL,
        normalized_output jsonb,
        input_tokens integer,
        output_tokens integer,
        provider_cost real,
        latency_ms integer,
        success boolean NOT NULL DEFAULT true,
        error_type varchar(64),
        error_message text,
        quality_rating varchar(32),
        location_rating varchar(32),
        admin_note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`ALTER TABLE playground_results ADD COLUMN IF NOT EXISTS model_id varchar(256)`,
    txn`ALTER TABLE playground_results ADD COLUMN IF NOT EXISTS gateway_provider varchar(128)`,

    txn`
      CREATE TABLE IF NOT EXISTS benchmark_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        image_url text NOT NULL,
        image_pathname text,
        country varchar(128) NOT NULL,
        region varchar(128),
        city varchar(128),
        latitude double precision,
        longitude double precision,
        difficulty varchar(32) NOT NULL DEFAULT 'medium',
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        configuration jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`
      CREATE TABLE IF NOT EXISTS benchmark_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        benchmark_run_id uuid NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
        benchmark_case_id uuid NOT NULL REFERENCES benchmark_cases(id) ON DELETE CASCADE,
        provider varchar(64),
        model varchar(256),
        model_id varchar(256),
        gateway_provider varchar(128),
        normalized_output jsonb,
        country_correct boolean,
        region_correct boolean,
        city_correct boolean,
        top3_correct boolean,
        latency_ms integer,
        provider_cost real,
        input_tokens integer,
        output_tokens integer,
        success boolean NOT NULL DEFAULT true,
        error_type varchar(64),
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `,

    txn`ALTER TABLE benchmark_results ADD COLUMN IF NOT EXISTS model_id varchar(256)`,
    txn`ALTER TABLE benchmark_results ADD COLUMN IF NOT EXISTS gateway_provider varchar(128)`,
  ])
}
