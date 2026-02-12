import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

function formatSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
  return `${(mbps * 1000).toFixed(0)} Kbps`
}

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'speedtest.py')
    const { stdout } = await execAsync(`python3 "${scriptPath}"`, {
      timeout: 120000,
    })

    const data = JSON.parse(stdout.trim())
    if (data.error) throw new Error(data.error)

    return NextResponse.json({
      download: {
        mbps: data.down_mbps,
        fmt: formatSpeed(data.down_mbps),
      },
      upload: {
        mbps: data.up_mbps,
        fmt: formatSpeed(data.up_mbps),
      },
      ping: data.ping,
      server: data.server || 'Unknown',
      sponsor: data.sponsor || '',
      isp: data.isp || '',
      ts: Date.now(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
