import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'

const INCIDENT_LOG = '/Users/bryanrowland/.brytools-watchdog/incidents.json'

export async function GET() {
  try {
    const raw = readFileSync(INCIDENT_LOG, 'utf-8')
    const incidents = JSON.parse(raw)
    // Return last 20, newest first
    return NextResponse.json({ incidents: incidents.slice(-20).reverse() })
  } catch {
    return NextResponse.json({ incidents: [] })
  }
}
