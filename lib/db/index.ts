import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'
import { ensureSchema } from './ensure-schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }
  const sql = neon(url)
  return drizzle(sql, { schema })
}

/** Return a Drizzle client. Does not wait for schema bootstrap. */
export function getDb() {
  if (_db) return _db
  _db = createDb()
  return _db
}

/**
 * Return a Drizzle client after ensuring admin tables exist.
 * Prefer this for admin APIs and production analyze logging.
 */
export async function getReadyDb() {
  await ensureSchema()
  return getDb()
}

export { schema, ensureSchema }
