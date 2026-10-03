/**
 * Client-only image compression shared by production upload and admin playground.
 * Keeps base64 JSON payloads under Vercel's ~4.5MB serverless body limit.
 */
export async function compressImageBlob(
  blob: Blob,
  options?: { maxDimension?: number; quality?: number }
): Promise<{ base64: string; mimeType: string; preview: string }> {
  const maxDimension = options?.maxDimension ?? 1024
  const quality = options?.quality ?? 0.82
  const src = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > maxDimension || h > maxDimension) {
        if (w > h) {
          h = Math.round((h * maxDimension) / w)
          w = maxDimension
        } else {
          w = Math.round((w * maxDimension) / h)
          h = maxDimension
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(src)
      canvas.toBlob(
        (compressed) => {
          if (!compressed) {
            reject(new Error('Canvas toBlob failed'))
            return
          }
          const reader = new FileReader()
          reader.onload = (e) => {
            const dataUrl = String(e.target?.result || '')
            const [meta, base64 = ''] = dataUrl.split(',')
            const mimeType = meta.replace('data:', '').replace(';base64', '') || 'image/jpeg'
            resolve({ base64, mimeType, preview: dataUrl })
          }
          reader.onerror = () => reject(new Error('Failed to read compressed image'))
          reader.readAsDataURL(compressed)
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('Image failed to load'))
    }
    img.src = src
  })
}
