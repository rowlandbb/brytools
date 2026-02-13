'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Wrench, Download, Mic, LayoutDashboard,
} from 'lucide-react'

const TABS = [
  { href: '/services', label: 'Servers', icon: LayoutDashboard },
  { href: '/dump', label: 'Import', icon: Download },
  { href: '/transcribe', label: 'Scribe', icon: Mic },
]

export function TabNav() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop: top nav */}
      <nav className="tab-nav tab-nav--top">
        {TABS.map(tab => {
          const isActive = pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab ${isActive ? 'tab--active' : ''}`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Mobile: bottom bar */}
      <nav className="tab-nav tab-nav--bottom">
        {TABS.map(tab => {
          const isActive = pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab-bottom ${isActive ? 'tab-bottom--active' : ''}`}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
