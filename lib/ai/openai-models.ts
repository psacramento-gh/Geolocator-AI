/** Shared OpenAI model-id heuristics used by discovery and the runtime adapter. */

/** Models that reject custom temperature and accept reasoning_effort. */
export function isOpenAiReasoningModel(model: string): boolean {
  const lower = model.toLowerCase()
  return /^(o[1-9]|gpt-5)/.test(lower)
}

/**
 * Vision-capable chat models we expose in admin pickers.
 * Excludes text-only o-series variants such as o1-mini / o3-mini.
 */
export function isOpenAiVisionModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (
    /(realtime|audio|transcribe|tts|whisper|dall-e|embedding|moderation|babbage|davinci|instruct|search|image-1|codex|computer-use)/i.test(
      lower
    )
  ) {
    return false
  }

  if (
    /^gpt-4o/.test(lower) ||
    /^gpt-4\.1/.test(lower) ||
    /^gpt-4-turbo/.test(lower) ||
    /^gpt-4-vision/.test(lower) ||
    /^chatgpt-4o/.test(lower) ||
    /^gpt-5/.test(lower)
  ) {
    return true
  }

  // o4-* (including o4-mini) supports vision; o1/o3 mini variants do not.
  if (/^o4/.test(lower)) return true
  if (/^o1/.test(lower)) return !lower.includes('mini')
  if (/^o3/.test(lower)) return !lower.includes('mini')

  return false
}
