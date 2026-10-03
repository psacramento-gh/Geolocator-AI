import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { benchmarkCases } from '@/lib/db/schema'
import { requireAdminApi } from '@/lib/auth/admin'
import { fetchPrivateBlob } from '@/lib/blob'

export async function GET(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const caseId = req.nextUrl.searchParams.get('caseId')
    if (!caseId) {
      return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
    }

    const db = getDb()
    const [row] = await db
      .select()
      .from(benchmarkCases)
      .where(eq(benchmarkCases.id, caseId))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const blob = await fetchPrivateBlob(row.imageUrl)
    if (!blob) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(blob.buffer), {
      headers: {
        'Content-Type': blob.contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
