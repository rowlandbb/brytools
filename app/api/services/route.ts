import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

// ─── Service Registry ───

interface ServiceDef {
  id: string
  label: string
  plist: string
  port: number | null
  type: string
  description: string
  funnelable: boolean
}

const SERVICES: ServiceDef[] = [
  {
    id: 'brytools',
    label: 'BryTools',
    plist: 'com.bryanrowland.brytools',
    port: 3002,
    type: 'Node.js',
    description: 'Unified personal toolbox',
    funnelable: true,
  },
  {
    id: 'skinwalker-archive',
    label: 'Skinwalker Archive',
    plist: 'com.bryan.skinwalker-archive',
    port: 5001,
    type: 'Node.js',
    description: 'Canon Vault editorial system',
    funnelable: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    plist: 'homebrew.mxcl.ollama',
    port: 11434,
    type: 'Homebrew',
    description: 'Local LLM inference',
    funnelable: false,
  },
]

// ─── Helpers ───

function shell(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

function getServiceStatus(plist: string): { status: 'running' | 'stopped' | 'errored'; pid: number | null; exitCode: number | null } {
  const line = shell(`launchctl list 2>/dev/null | grep "${plist}"`)
  if (!line) return { status: 'stopped', pid: null, exitCode: null }

  const parts = line.split(/\s+/)
  const pidStr = parts[0]
  const exitStr = parts[1]
  const pid = pidStr && pidStr !== '-' ? parseInt(pidStr) : null
  const exitCode = exitStr ? parseInt(exitStr) : null

  if (pid && pid > 0) return { status: 'running', pid, exitCode }
  if (exitCode !== null && exitCode !== 0) return { status: 'errored', pid: null, exitCode }
  return { status: 'stopped', pid: null, exitCode }
}

function getProcessUptime(pid: number): string | null {
  const elapsed = shell(`ps -p ${pid} -o etime= 2>/dev/null`)
  return elapsed || null
}

function isPortListening(port: number): boolean {
  const result = shell(`lsof -iTCP:${port} -sTCP:LISTEN -P -n 2>/dev/null | grep -c LISTEN`)
  return parseInt(result) > 0
}

function getTailscaleFunnel(): { active: boolean; port: number | null; url: string | null } {
  const status = shell(`/Applications/Tailscale.app/Contents/MacOS/Tailscale serve status 2>/dev/null || tailscale serve status 2>/dev/null`)
  if (!status || !status.includes('Funnel on')) return { active: false, port: null, url: null }

  const urlMatch = status.match(/https:\/\/[^\s]+/)
  const proxyMatch = status.match(/proxy\s+http:\/\/127\.0\.0\.1:(\d+)/)
  return {
    active: true,
    port: proxyMatch ? parseInt(proxyMatch[1]) : null,
    url: urlMatch ? urlMatch[0] : null,
  }
}

// ─── GET: Service status ───

export async function GET() {
  const funnel = getTailscaleFunnel()

  const services = SERVICES.map(svc => {
    const { status: launchdStatus, pid, exitCode } = getServiceStatus(svc.plist)
    const portOpen = svc.port ? isPortListening(svc.port) : false
    const uptime = pid ? getProcessUptime(pid) : null

    // Smart status: if port is listening, service is effectively running
    // even if launchd thinks otherwise (e.g. restarted via CLI)
    let status = launchdStatus
    if (portOpen && status !== 'running') status = 'running'

    const isFunneled = funnel.active && funnel.port === svc.port

    return {
      ...svc,
      status,
      pid,
      exitCode,
      portOpen,
      uptime,
      isFunneled,
    }
  })

  return NextResponse.json({ services, funnel })
}

// ─── POST: Service actions ───

export async function POST(req: Request) {
  const { id, action } = await req.json()

  const svc = SERVICES.find(s => s.id === id)
  if (!svc) return NextResponse.json({ error: 'Unknown service' }, { status: 404 })

  const plistPath = `${process.env.HOME}/Library/LaunchAgents/${svc.plist}.plist`
  const homebrewPlistPath = `${process.env.HOME}/Library/LaunchAgents/${svc.plist}.plist`

  try {
    switch (action) {
      case 'start':
        shell(`launchctl load "${plistPath}" 2>&1`)
        shell(`launchctl start "${svc.plist}" 2>&1`)
        break

      case 'stop':
        shell(`launchctl stop "${svc.plist}" 2>&1`)
        break

      case 'restart':
        shell(`launchctl stop "${svc.plist}" 2>&1`)
        // Brief pause for clean shutdown
        await new Promise(r => setTimeout(r, 1000))
        shell(`launchctl start "${svc.plist}" 2>&1`)
        break

      case 'funnel-on':
        if (!svc.port || !svc.funnelable) {
          return NextResponse.json({ error: 'Service cannot be funneled' }, { status: 400 })
        }
        // Turn off existing funnel first, then set new one
        shell(`/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel off 2>/dev/null || tailscale funnel off 2>/dev/null`)
        shell(`/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg ${svc.port} 2>/dev/null || tailscale serve --bg ${svc.port} 2>/dev/null`)
        shell(`/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel on 2>/dev/null || tailscale funnel on 2>/dev/null`)
        break

      case 'funnel-off':
        shell(`/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel off 2>/dev/null || tailscale funnel off 2>/dev/null`)
        break

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // Brief wait for launchd to settle
    await new Promise(r => setTimeout(r, 500))

    // Return fresh status
    const { status, pid, exitCode } = getServiceStatus(svc.plist)
    const portOpen = svc.port ? isPortListening(svc.port) : false
    const uptime = pid ? getProcessUptime(pid) : null
    const funnel = getTailscaleFunnel()
    const isFunneled = funnel.active && funnel.port === svc.port

    return NextResponse.json({
      ...svc,
      status, pid, exitCode, portOpen, uptime, isFunneled,
      funnel,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
