import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { getMiniPower } from '@/lib/power-cache'

function shell(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

const LOG_PATHS: Record<string, { stdout: string; stderr: string }> = {
  'skinwalker-archive': {
    stdout: '/Users/bryanrowland/Documents/Vibe/swu-scripts/logs/archive-stdout.log',
    stderr: '/Users/bryanrowland/Documents/Vibe/swu-scripts/logs/archive-stderr.log',
  },
  'brytools': {
    stdout: '/Users/bryanrowland/Documents/Vibe/brytools/brytools.log',
    stderr: '/Users/bryanrowland/Documents/Vibe/brytools/brytools.log',
  },
}

// ─── Telemetry Collectors ───

function checkVolume(path: string): { mounted: boolean; name: string; total?: string; used?: string; avail?: string; percent?: number } {
  const name = path.split('/').filter(Boolean).pop() || path
  const testExists = shell(`test -d "${path}" && echo "yes" || echo "no"`)
  if (testExists !== 'yes') return { mounted: false, name }
  const line = shell(`df -h "${path}" 2>/dev/null | tail -1`)
  const match = line.match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/)
  if (!match) return { mounted: true, name }
  return { mounted: true, name, total: match[1], used: match[2], avail: match[3], percent: parseInt(match[4]) }
}

function getVolumes() {
  const important = [
    { path: '/Volumes/RowMedia', label: 'RowMedia', needs: ['brytools'] },
    { path: '/Volumes/ME Backup02', label: 'ME Backup02', needs: ['brytools'] },
    { path: '/Volumes/ME Backup01', label: 'ME Backup01', needs: [] },

    { path: '/Volumes/bryan-1', label: 'Mac Studio (SMB)', needs: [] },
  ]
  return important.map(v => ({ ...checkVolume(v.path), label: v.label, needs: v.needs }))
}

function getSystemStats() {
  const cpuLine = shell("top -l 1 -n 0 2>/dev/null | grep 'CPU usage'")
  const cpuMatch = cpuLine.match(/([\d.]+)% user.*?([\d.]+)% sys.*?([\d.]+)% idle/)
  const cpuUser = cpuMatch ? parseFloat(cpuMatch[1]) : 0
  const cpuSys = cpuMatch ? parseFloat(cpuMatch[2]) : 0
  const cpuIdle = cpuMatch ? parseFloat(cpuMatch[3]) : 0

  const memRaw = shell("vm_stat 2>/dev/null")
  const pageSize = 16384
  const free = parseInt(memRaw.match(/Pages free:\s+(\d+)/)?.[1] || '0') * pageSize
  const active = parseInt(memRaw.match(/Pages active:\s+(\d+)/)?.[1] || '0') * pageSize
  const inactive = parseInt(memRaw.match(/Pages inactive:\s+(\d+)/)?.[1] || '0') * pageSize
  const wired = parseInt(memRaw.match(/Pages wired down:\s+(\d+)/)?.[1] || '0') * pageSize
  const totalMem = 32 * 1073741824 // 32GB
  const usedMem = active + wired
  const memPercent = Math.round((usedMem / totalMem) * 100)

  const diskLine = shell("df -h /Volumes/RowMedia 2>/dev/null | tail -1")
  const diskMatch = diskLine.match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/)

  // GPU stats via ioreg
  const gpuRaw = shell("ioreg -l 2>/dev/null | grep 'PerformanceStatistics' | head -1")
  const gpuDevice = parseInt(gpuRaw.match(/"Device Utilization %"=(\d+)/)?.[1] || '0')

  // Power consumption (read from background cache, non-blocking)
  const power = getMiniPower()

  return {
    cpu: { user: cpuUser, sys: cpuSys, idle: cpuIdle, total: Math.round(cpuUser + cpuSys) },
    mem: { usedGB: (usedMem / 1073741824).toFixed(1), totalGB: '32', percent: memPercent },
    disk: diskMatch ? { total: diskMatch[1], used: diskMatch[2], avail: diskMatch[3], percent: parseInt(diskMatch[4]) } : null,
    gpu: { device: gpuDevice },
    power,
  }
}

function getProcessMem(pid: number | null): string | null {
  if (!pid) return null
  const line = shell(`ps -p ${pid} -o rss= 2>/dev/null`)
  if (!line) return null
  const mb = parseInt(line) / 1024
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function getSkinwalkerTelemetry() {
  const logContent = shell("tail -100 '/Users/bryanrowland/Documents/Vibe/swu-scripts/logs/archive-stdout.log' 2>/dev/null")
  const lines = logContent.split('\n').filter(Boolean)

  // Count POST/GET requests from logs
  const posts = lines.filter(l => l.includes('POST')).length
  const gets = lines.filter(l => l.includes('GET')).length

  // Canon vault JSON count
  const canonCount = shell("find /Users/bryanrowland/Documents/Vibe/swu-scripts/canon-vault/ -name '*.json' 2>/dev/null | wc -l").trim()

  // Source markdown count
  const sourceCount = shell("find /Users/bryanrowland/Documents/Vibe/swu-scripts/ -maxdepth 1 -name '*.md' 2>/dev/null | wc -l").trim()

  // Recent activity (last 10 meaningful log lines)
  const recentActivity = lines
    .filter(l => l.includes('POST') || l.includes('GET') || l.includes('Ready'))
    .slice(-8)

  // Process memory
  const pid = shell("lsof -iTCP:5001 -sTCP:LISTEN -P -n 2>/dev/null | grep node | awk '{print $2}' | head -1")
  const mem = pid ? getProcessMem(parseInt(pid)) : null

  // Active connections
  const connections = shell("lsof -iTCP:5001 -sTCP:ESTABLISHED -P -n 2>/dev/null | wc -l").trim()

  return {
    canonEntries: parseInt(canonCount) || 0,
    sourceFiles: parseInt(sourceCount) || 0,
    recentPosts: posts,
    recentGets: gets,
    recentActivity,
    memory: mem,
    connections: parseInt(connections) || 0,

  }
}

function getBrytoolsTelemetry() {
  // Download history
  const dlCount = shell('sqlite3 "/Volumes/ME Backup02/_Dump/brytools.db" "SELECT COUNT(*) FROM downloads" 2>/dev/null')
  const dlSize = shell('sqlite3 "/Volumes/ME Backup02/_Dump/brytools.db" "SELECT SUM(file_size) FROM downloads WHERE file_size IS NOT NULL" 2>/dev/null')

  // Transcription stats
  const transcriptCount = shell("ls '/Volumes/ME Backup02/BryTranscribe/transcriptions/' 2>/dev/null | wc -l").trim()
  const sourceCount = shell("ls '/Volumes/ME Backup02/BryTranscribe/Done/' 2>/dev/null | wc -l").trim()

  // Dump folder size
  const dumpSize = shell("du -sh '/Volumes/ME Backup02/_Dump/' 2>/dev/null | awk '{print $1}'")

  // System stats
  const sys = getSystemStats()

  // Uptime
  const uptime = shell("uptime 2>/dev/null")
  const uptimeMatch = uptime.match(/up\s+(.+?),\s+\d+\s+user/)
  const loadMatch = uptime.match(/load averages?:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)

  return {
    downloads: { count: parseInt(dlCount) || 0, totalBytes: parseInt(dlSize) || 0 },
    transcripts: { completed: parseInt(transcriptCount) || 0, sources: parseInt(sourceCount) || 0 },
    dumpSize: dumpSize || '0',
    system: sys,
    uptime: uptimeMatch ? uptimeMatch[1].trim() : 'unknown',
    loadAvg: loadMatch ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])] : [0, 0, 0],
    volumes: getVolumes(),
  }
}

// ─── GET endpoint ───

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const paths = LOG_PATHS[id]

  // Get log lines
  let logLines: string[] = ['No log output found.']
  if (paths && paths.stdout) {
    let raw = shell(`tail -20 "${paths.stdout}" 2>/dev/null`)
    if (!raw) raw = shell(`tail -20 "${paths.stderr}" 2>/dev/null`)
    if (raw) logLines = raw.split('\n')
  }

  // Get service-specific telemetry
  let telemetry: Record<string, unknown> = {}
  if (id === 'skinwalker-archive') telemetry = getSkinwalkerTelemetry()
  else if (id === 'brytools') telemetry = getBrytoolsTelemetry()

  return NextResponse.json({ lines: logLines, telemetry })
}
