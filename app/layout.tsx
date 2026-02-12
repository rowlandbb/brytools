import type { Metadata, Viewport } from "next"
import "./globals.css"
import { TabNav } from "./tab-nav"

export const metadata: Metadata = {
  title: "BryTools",
  description: "Bryan's personal toolbox",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BryTools",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#090909",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <div className="page">
          <header className="header">
            <div className="header-inner">
              <div className="logo">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="1" y="3" width="3" height="12" rx="0.5" fill="#b8977a" opacity="0.9" />
                  <rect x="6" y="1" width="3" height="16" rx="0.5" fill="#b8977a" opacity="0.6" />
                  <rect x="11" y="5" width="3" height="8" rx="0.5" fill="#b8977a" opacity="0.4" />
                  <rect x="16" y="7" width="1.5" height="4" rx="0.5" fill="#b8977a" opacity="0.25" />
                </svg>
                <span className="logo-text">BryTools</span>
              </div>
              <div className="header-right">
                <TabNav />
              </div>
            </div>
          </header>
          <main className="main">
            {children}
          </main>
          <footer className="footer">BryTools · Whisper AI · yt-dlp · Tailscale</footer>
        </div>
      </body>
    </html>
  )
}
