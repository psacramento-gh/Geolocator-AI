import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { benchmarkCases } from '@/lib/db/schema'
import { requireAdminApi } from '@/lib/auth/admin'
import { deleteBenchmarkImage, uploadBenchmarkImage } from '@/lib/blob'

export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const db = getDb()
    const cases = await db.select().from(benchmarkCases).orderBy(desc(benchmarkCases.createdAt))
    return NextResponse.json({ cases })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list cases'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const form = await req.formData()
    const file = form.get('image')
    const country = String(form.get('country') || '').trim()
    const region = String(form.get('region') || '').trim() || null
    const city = String(form.get('city') || '').trim() || null
    const difficulty = String(form.get('difficulty') || 'medium')
    const notes = String(form.get('notes') || '').trim() || null
    const latRaw = String(form.get('latitude') || '')
    const lngRaw = String(form.get('longitude') || '')
    const latitude = latRaw ? Number(latRaw) : null
    const longitude = lngRaw ? Number(lngRaw) : null

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }
    if (!country) {
      return NextResponse.json({ error: 'Country is required' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const blob = await uploadBenchmarkImage(
      file.name || 'benchmark.jpg',
      bytes,
      file.type || 'image/jpeg'
    )

    const db = getDb()
    const [created] = await db
      .insert(benchmarkCases)
      .values({
        imageUrl: blob.url,
        imagePathname: blob.pathname,
        country,
        region,
        city,
        latitude: Number.isFinite(latitude as number) ? latitude : null,
        longitude: Number.isFinite(longitude as number) ? longitude : null,
        difficulty,
        notes,
      })
      .returning()

    return NextResponse.json({ case: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create case'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const db = getDb()
    const [existing] = await db.select().from(benchmarkCases).where(eq(benchmarkCases.id, id)).limit(1)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await deleteBenchmarkImage(existing.imageUrl)
    await db.delete(benchmarkCases).where(eq(benchmarkCases.id, id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete case'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
