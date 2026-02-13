import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

const STUDIO_SSH = 'ssh -o BatchMode=yes -o ConnectTimeout=5 bryan@100.100.179.121'

function shell(cmd: string, timeout = 12000): string {
  try {
    return execSync(cmd, { timeout, encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

export async function GET() {
  // Run all SSH commands in a single session for speed
  const raw = shell(`${STUDIO_SSH} '
    echo "===CPU==="
    top -l 1 -n 0 2>/dev/null | grep "CPU usage"
    echo "===MEM==="
    vm_stat 2>/dev/null
    echo "===MEMSIZE==="
    sysctl -n hw.memsize
    echo "===UPTIME==="
    uptime
    echo "===DISK==="
    df -h / 2>/dev/null | tail -1
    echo "===GPU==="
    ioreg -l 2>/dev/null | grep "PerformanceStatistics" | head -1
    echo "===NCPU==="
    sysctl -n hw.ncpu
    echo "===CPUBRAND==="
    sysctl -n machdep.cpu.brand_string
  '`, 15000)

  if (!raw) {
    return NextResponse.json({ error: 'Studio unreachable', reachable: false })
  }

  const sections: Record<string, string> = {}
  let currentKey = ''
  for (const line of raw.split('\n')) {
    const match = line.match(/^===(\w+)===$/)
    if (match) {
      currentKey = match[1]
      sections[currentKey] = ''
    } else if (currentKey) {
      sections[currentKey] += (sections[currentKey] ? '\n' : '') + line
    }
  }

  // Parse CPU
  const cpuMatch = sections.CPU?.match(/([\d.]+)% user.*?([\d.]+)% sys.*?([\d.]+)% idle/)
  const cpuUser = cpuMatch ? parseFloat(cpuMatch[1]) : 0
  const cpuSys = cpuMatch ? parseFloat(cpuMatch[2]) : 0
  const cpu = { user: cpuUser, sys: cpuSys, total: Math.round(cpuUser + cpuSys) }

  // Parse Memory
  const pageSize = 16384
  const memRaw = sections.MEM || ''
  const free = parseInt(memRaw.match(/Pages free:\s+(\d+)/)?.[1] || '0') * pageSize
  const active = parseInt(memRaw.match(/Pages active:\s+(\d+)/)?.[1] || '0') * pageSize
  const inactive = parseInt(memRaw.match(/Pages inactive:\s+(\d+)/)?.[1] || '0') * pageSize
  const speculative = parseInt(memRaw.match(/Pages speculative:\s+(\d+)/)?.[1] || '0') * pageSize
  const wired = parseInt(memRaw.match(/Pages wired down:\s+(\d+)/)?.[1] || '0') * pageSize
  const compressed = parseInt(memRaw.match(/Pages occupied by compressor:\s+(\d+)/)?.[1] || '0') * pageSize
  const totalMem = parseInt(sections.MEMSIZE || '0')
  const usedMem = active + wired + compressed
  const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0

  const mem = {
    usedGB: (usedMem / 1073741824).toFixed(1),
    totalGB: Math.round(totalMem / 1073741824).toString(),
    percent: memPercent,
    activeGB: (active / 1073741824).toFixed(1),
    wiredGB: (wired / 1073741824).toFixed(1),
    compressedGB: (compressed / 1073741824).toFixed(1),
    freeGB: ((free + inactive + speculative) / 1073741824).toFixed(1),
  }

  // Parse GPU
  const gpuRaw = sections.GPU || ''
  const deviceUtil = gpuRaw.match(/"Device Utilization %"=(\d+)/)?.[1]
  const rendererUtil = gpuRaw.match(/"Renderer Utilization %"=(\d+)/)?.[1]
  const tilerUtil = gpuRaw.match(/"Tiler Utilization %"=(\d+)/)?.[1]
  const allocSysMem = gpuRaw.match(/"Alloc system memory"=(\d+)/)?.[1]
  const inUseSysMem = gpuRaw.match(/"In use system memory"=(\d+)/)?.[1]

  const gpu = {
    device: parseInt(deviceUtil || '0'),
    renderer: parseInt(rendererUtil || '0'),
    tiler: parseInt(tilerUtil || '0'),
    allocGB: allocSysMem ? (parseInt(allocSysMem) / 1073741824).toFixed(1) : '0',
    inUseGB: inUseSysMem ? (parseInt(inUseSysMem) / 1073741824).toFixed(1) : '0',
  }

  // Parse Disk
  const diskMatch = sections.DISK?.match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/)
  const disk = diskMatch ? {
    total: diskMatch[1],
    used: diskMatch[2],
    avail: diskMatch[3],
    percent: parseInt(diskMatch[4]),
  } : null

  // Parse Uptime
  const uptimeMatch = sections.UPTIME?.match(/up\s+(.+?),\s+\d+\s+user/)
  const loadMatch = sections.UPTIME?.match(/load averages?:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  const uptime = uptimeMatch ? uptimeMatch[1].trim() : 'unknown'
  const loadAvg = loadMatch ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])] : [0, 0, 0]

  // Machine info
  const ncpu = parseInt(sections.NCPU || '0')
  const cpuBrand = sections.CPUBRAND || 'Unknown'

  return NextResponse.json({
    reachable: true,
    cpu, mem, gpu, disk,
    uptime, loadAvg,
    machine: { cores: ncpu, chip: cpuBrand, ramGB: Math.round(totalMem / 1073741824) },
  })
}
