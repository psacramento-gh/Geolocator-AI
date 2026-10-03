import Link from 'next/link'
import { AdminNav } from '@/components/admin/AdminNav'
import { LogoutButton } from '@/components/admin/LogoutButton'
import { isAdminAuthenticated } from '@/lib/auth/admin'

export const metadata = {
  title: 'GeoLocator Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdminAuthenticated()

  return (
    <div className="min-h-screen bg-background text-foreground">
      {authed ? (
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/admin" className="text-sm font-semibold tracking-tight">
                GeoLocator Admin
              </Link>
              <AdminNav />
            </div>
            <LogoutButton />
          </div>
        </header>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
