'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dump', label: 'Dump' },
  { href: '/transcribe', label: 'Transcribe' },
]

export function TabNav() {
  const pathname = usePathname()

  return (
    <nav className="tab-nav">
      {TABS.map(tab => {
        const isActive = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tab ${isActive ? 'tab--active' : ''}`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
