import { exec } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

// Background power sampling using async exec (non-blocking)
// Writes readings to tmp files, API routes read them instantly

const MINI_CACHE = '/tmp/brytools-power-mini.json'
const STUDIO_CACHE = '/tmp/brytools-power-studio.json'
const STUDIO_SSH = 'ssh -o BatchMode=yes -o ConnectTimeout=5 bryan@100.100.179.121'

let miniTimer: ReturnType<typeof setInterval> | null = null
let studioTimer: ReturnType<typeof setInterval> | null = null
let miniSampling = false
let studioSampling = false

function sampleMini() {
  if (miniSampling) return
  miniSampling = true
  exec("sudo -n powermetrics --samplers cpu_power -i 500 -n 1 2>/dev/null | grep 'Combined Power'", { timeout: 5000 }, (err, stdout) => {
    miniSampling = false
    if (err) return
    const match = stdout.match(/Combined Power.*?:\s*([\d.]+)\s*mW/)
    if (match) {
      try {
        writeFileSync(MINI_CACHE, JSON.stringify({ watts: Math.round(parseFloat(match[1]) / 100) / 10, ts: Date.now() }))
      } catch { /* ignore */ }
    }
  })
}

function sampleStudio() {
  if (studioSampling) return
  studioSampling = true
  exec(`${STUDIO_SSH} 'sudo -n powermetrics --samplers cpu_power -i 500 -n 1 2>/dev/null | grep "Combined Power"'`, { timeout: 10000 }, (err, stdout) => {
    studioSampling = false
    if (err) return
    const match = stdout.match(/Combined Power.*?:\s*([\d.]+)\s*mW/)
    if (match) {
      try {
        writeFileSync(STUDIO_CACHE, JSON.stringify({ watts: Math.round(parseFloat(match[1]) / 100) / 10, ts: Date.now() }))
      } catch { /* ignore */ }
    }
  })
}

function ensureRunning() {
  if (!miniTimer) {
    sampleMini()
    miniTimer = setInterval(sampleMini, 5000)
  }
  if (!studioTimer) {
    sampleStudio()
    studioTimer = setInterval(sampleStudio, 6000)
  }
}

function readCache(path: string): { watts: number } {
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw)
    // Only use readings less than 30s old
    if (Date.now() - data.ts < 30000) {
      return { watts: data.watts }
    }
  } catch { /* ignore */ }
  return { watts: 0 }
}

export function getMiniPower(): { watts: number } {
  ensureRunning()
  return readCache(MINI_CACHE)
}

export function getStudioPower(): { watts: number } {
  ensureRunning()
  return readCache(STUDIO_CACHE)
}
