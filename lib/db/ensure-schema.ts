import { neon } from '@neondatabase/serverless'

let schemaReady: Promise<void> | null = null

/**
 * Create admin tables if they do not exist yet.
 * Safe to call repeatedly — uses IF NOT EXISTS and a process-level lock.
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

  // Neon Postgres includes gen_random_uuid(); keep this for older branches.
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`

  await sql`
    CREATE TABLE IF NOT EXISTS model_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(128) NOT NULL,
      provider varchar(64) NOT NULL,
      model varchar(128) NOT NULL,
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
  `

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS model_configs_production_slot_uidx
    ON model_configs (production_slot)
  `

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS model_configs_one_production_uidx
    ON model_configs (is_production)
    WHERE is_production = true
  `

  await sql`
    CREATE TABLE IF NOT EXISTS model_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id varchar(64) NOT NULL,
      provider varchar(64) NOT NULL,
      model varchar(128) NOT NULL,
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
  `

  await sql`
    CREATE TABLE IF NOT EXISTS playground_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS playground_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playground_run_id uuid NOT NULL REFERENCES playground_runs(id) ON DELETE CASCADE,
      provider varchar(64) NOT NULL,
      model varchar(128) NOT NULL,
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
  `

  await sql`
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
  `

  await sql`
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      configuration jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS benchmark_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      benchmark_run_id uuid NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
      benchmark_case_id uuid NOT NULL REFERENCES benchmark_cases(id) ON DELETE CASCADE,
      provider varchar(64) NOT NULL,
      model varchar(128) NOT NULL,
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
  `
}
