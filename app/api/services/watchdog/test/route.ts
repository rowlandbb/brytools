import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const CONFIG_PATH = '/Users/bryanrowland/.brytools-watchdog/config.json'

export async function POST() {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    const alertTo = cfg.alertTo
    if (!alertTo) return NextResponse.json({ error: 'No phone configured' }, { status: 400 })

    execSync(`osascript -e '
      tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "${alertTo}" of targetService
        send "✅ BryTools Watchdog test — alerts are working!" to targetBuddy
      end tell
    '`, { timeout: 20000 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
