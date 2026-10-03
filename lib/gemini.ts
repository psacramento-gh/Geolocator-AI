/**
 * Back-compat shim. Prefer importing from `@/lib/ai`.
 */
export { DEFAULT_GEOLOCATION_PROMPT as SYSTEM_PROMPT } from '@/lib/ai/default-prompt'
export { getGeminiClient } from '@/lib/ai/providers/gemini-client'
