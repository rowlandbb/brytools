import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

function shell(cmd: string): string {
  try { return execSync(cmd, { timeout: 3000, encoding: 'utf-8' }).trim() }
  catch { return '' }
}

// ─── Rolling buffer (persists in module scope across requests) ───

interface NetSample {
  ts: number
  rxRate: number  // bytes/sec down
  txRate: number  // bytes/sec up
}

const BUFFER_SIZE = 120
const buffer: NetSample[] = []
let lastSample: { ts: number; rx: number; tx: number } | null = null

function sampleNetwork(): { rx: number; tx: number } | null {
  // Parse en0 cumulative byte counters from netstat
  const raw = shell("netstat -ib 2>/dev/null | awk '/^en0.*Link/{print $7, $10}'")
  if (!raw) return null
  const parts = raw.split(/\s+/)
  if (parts.length < 2) return null
  return { rx: parseInt(parts[0]) || 0, tx: parseInt(parts[1]) || 0 }
}

function takeSample() {
  const now = Date.now()
  const current = sampleNetwork()
  if (!current) return

  if (lastSample) {
    const elapsed = (now - lastSample.ts) / 1000 // seconds
    if (elapsed > 0.2) {
      const rxRate = Math.max(0, (current.rx - lastSample.rx) / elapsed)
      const txRate = Math.max(0, (current.tx - lastSample.tx) / elapsed)
      buffer.push({ ts: now, rxRate, txRate })
      if (buffer.length > BUFFER_SIZE) buffer.shift()
    }
  }

  lastSample = { ts: now, rx: current.rx, tx: current.tx }
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  if (bytesPerSec < 1073741824) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`
  return `${(bytesPerSec / 1073741824).toFixed(2)} GB/s`
}

// ─── Fast sampling mode for speed tests ───
let fastInterval: ReturnType<typeof setInterval> | null = null
let fastModeExpiry = 0

function startFastSampling() {
  fastModeExpiry = Date.now() + 90000 // 90 seconds max
  if (fastInterval) return // already running
  fastInterval = setInterval(() => {
    if (Date.now() > fastModeExpiry) {
      if (fastInterval) clearInterval(fastInterval)
      fastInterval = null
      return
    }
    takeSample()
  }, 400) // sample every 400ms
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('fast') === '1') {
    startFastSampling()
  }

  // Take a fresh sample on each request
  takeSample()

  const latest = buffer.length > 0 ? buffer[buffer.length - 1] : null

  return NextResponse.json({
    samples: buffer.map(s => ({
      ts: s.ts,
      down: Math.round(s.rxRate),
      up: Math.round(s.txRate),
    })),
    current: latest ? {
      down: Math.round(latest.rxRate),
      up: Math.round(latest.txRate),
      downFmt: formatRate(latest.rxRate),
      upFmt: formatRate(latest.txRate),
    } : null,
    bufferSize: BUFFER_SIZE,
  })
}
