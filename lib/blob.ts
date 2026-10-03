import { put, del, get } from '@vercel/blob'

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

export async function uploadBenchmarkImage(
  filename: string,
  data: Buffer | Blob | ArrayBuffer,
  contentType: string
) {
  const blob = await put(`benchmarks/${Date.now()}-${filename}`, data, {
    access: 'private',
    contentType,
    addRandomSuffix: true,
  })
  return blob
}

export async function deleteBenchmarkImage(url: string) {
  try {
    await del(url)
  } catch (err) {
    console.error('[blob] delete failed', err instanceof Error ? err.message : 'unknown')
  }
}

export async function fetchPrivateBlob(urlOrPathname: string): Promise<{
  buffer: Buffer
  contentType: string
} | null> {
  const result = await get(urlOrPathname, { access: 'private' })
  if (!result || !result.stream) return null
  const buffer = await streamToBuffer(result.stream)
  return {
    buffer,
    contentType: result.blob.contentType || 'application/octet-stream',
  }
}
