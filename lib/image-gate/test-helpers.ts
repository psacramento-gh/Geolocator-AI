import { crc32, deflateSync } from 'zlib'

/** Build a minimal valid PNG with the given dimensions (solid black RGB). */
export function makePngBuffer(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // RGB
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0

  const ihdr = pngChunk('IHDR', ihdrData)

  const row = Buffer.alloc(1 + width * 3) // filter byte + RGB
  const raw = Buffer.alloc(height * row.length)
  // rows are already zero-filled (black)
  const compressed = deflateSync(raw)
  const idat = pngChunk('IDAT', compressed)
  const iend = pngChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  const crc = crc32(Buffer.concat([typeBuf, data]))
  crcBuf.writeUInt32BE(crc >>> 0, 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

export function toBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}
