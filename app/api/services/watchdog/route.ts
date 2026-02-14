import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'

const CONFIG_PATH = '/Users/bryanrowland/.brytools-watchdog/config.json'
const STATE_DIR = '/Users/bryanrowland/.brytools-watchdog'
const PLIST = '/Users/bryanrowland/Library/LaunchAgents/com.bryanrowland.brytools-watchdog.plist'

function readConfig(): Record<string, string> {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return {} }
}

function writeConfig(cfg: Record<string, string>) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function getUid(): string {
  try { return execSync('id -u', { encoding: 'utf-8' }).trim() }
  catch { return '501' }
}

function isLoaded(): boolean {
  try {
    const out = execSync('launchctl list 2>/dev/null', { encoding: 'utf-8' })
    return out.includes('com.bryanrowland.brytools-watchdog')
  } catch { return false }
}

export async function GET() {
  const cfg = readConfig()
  const loaded = isLoaded()
  return NextResponse.json({ alertTo: cfg.alertTo || '', enabled: loaded, configured: !!cfg.alertTo })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Toggle enabled/disabled
  if (body.action === 'toggle') {
    const loaded = isLoaded()
    const uid = getUid()
    try {
      if (loaded) {
        execSync(`launchctl bootout gui/${uid}/com.bryanrowland.brytools-watchdog 2>/dev/null`)
      } else {
        execSync(`launchctl bootstrap gui/${uid} ${PLIST} 2>/dev/null`)
      }
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true, enabled: !loaded })
  }

  // Save phone number
  const { alertTo } = body
  const cfg = readConfig()
  cfg.alertTo = alertTo || ''
  writeConfig(cfg)

  // Also update the watchdog script's ALERT_TO in both locations
  try {
    const paths = [
      '/Users/bryanrowland/Documents/Vibe/brytools/watchdog.sh',
      '/Users/bryanrowland/.brytools-watchdog/watchdog.sh',
    ]
    for (const scriptPath of paths) {
      try {
        let script = readFileSync(scriptPath, 'utf-8')
        script = script.replace(/^ALERT_TO=".*"$/m, `ALERT_TO="${alertTo || ''}"`)
        writeFileSync(scriptPath, script)
      } catch { /* skip if file doesn't exist */ }
    }
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, alertTo: cfg.alertTo })
}
