'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/production', label: 'Production' },
  { href: '/admin/playground', label: 'Playground' },
  { href: '/admin/benchmarks', label: 'Benchmarks' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-sm transition-colors',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
