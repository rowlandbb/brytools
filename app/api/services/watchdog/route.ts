import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const CONFIG_PATH = '/Users/bryanrowland/.brytools-watchdog/config.json'
const STATE_DIR = '/Users/bryanrowland/.brytools-watchdog'

function readConfig(): Record<string, string> {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return {} }
}

function writeConfig(cfg: Record<string, string>) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

export async function GET() {
  const cfg = readConfig()
  return NextResponse.json({ alertTo: cfg.alertTo || '', enabled: !!cfg.alertTo })
}

export async function POST(req: NextRequest) {
  const { alertTo } = await req.json()
  const cfg = readConfig()
  cfg.alertTo = alertTo || ''
  writeConfig(cfg)

  // Also update the watchdog script's ALERT_TO in both locations
  try {
    const paths = [
      '/Volumes/RowMedia/CODE/brytools/watchdog.sh',
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
