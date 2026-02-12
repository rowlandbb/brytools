import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'

const PROGRESS_FILE = '/tmp/brytools-speedtest-progress.json'

export async function GET() {
  try {
    const raw = readFileSync(PROGRESS_FILE, 'utf-8')
    return NextResponse.json(JSON.parse(raw))
  } catch {
    return NextResponse.json({
      phase: 'idle',
      down_mbps: 0, up_mbps: 0, ping: 0,
      pct: 0, done: false
    })
  }
}
