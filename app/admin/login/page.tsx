'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Only allow same-origin relative paths under /admin (no open redirects / XSS). */
function safeAdminNextPath(raw: string | null): string {
  if (!raw) return '/admin'
  if (!raw.startsWith('/')) return '/admin'
  if (raw.startsWith('//')) return '/admin'
  if (raw.includes('\\') || raw.includes('\0')) return '/admin'
  if (!raw.startsWith('/admin')) return '/admin'
  // Block scheme-like or encoded tricks after the path
  try {
    const url = new URL(raw, 'http://localhost')
    if (url.origin !== 'http://localhost') return '/admin'
    if (!url.pathname.startsWith('/admin')) return '/admin'
    return `${url.pathname}${url.search}`
  } catch {
    return '/admin'
  }
}

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Login failed')
        return
      }
      router.replace(safeAdminNextPath(search.get('next')))
      router.refresh()
    } catch {
      setError('Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Admin access</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="secret">Admin secret</Label>
            <Input
              id="secret"
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
