'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Server, Zap,
  Cpu,
} from 'lucide-react'
import Heartbeat from './heartbeat'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ───

interface StudioTelemetry {
  reachable: boolean
  cpu: { user: number; sys: number; total: number }
  mem: { usedGB: string; totalGB: string; percent: number; activeGB: string; wiredGB: string; compressedGB: string; freeGB: string }
  gpu: { device: number; renderer: number; tiler: number; allocGB: string; inUseGB: string }
  disk: { total: string; used: string; avail: string; percent: number } | null
  power: { watts: number }
  uptime: string
  loadAvg: number[]
  machine: { cores: number; chip: string; ramGB: number }
}

// ─── Gauge ───

function Gauge({ value, max, label, unit, color }: { value: number; max: number; label: string; unit: string; color: string }) {
  const pct = Math.min(value / max, 1)
  const r = 38; const cx = 48; const cy = 48; const sw = 5
  const startAngle = -225; const endAngle = 45; const range = endAngle - startAngle
  const bgStart = ((startAngle - 90) * Math.PI) / 180
  const bgEnd = ((endAngle - 90) * Math.PI) / 180
  const valEnd = (((startAngle + range * pct) - 90) * Math.PI) / 180
  const arcPath = (s: number, e: number) => {
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    return `M ${x1} ${y1} A ${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${x2} ${y2}`
  }
  return (
    <div className="svc-gauge">
      <svg width="96" height="88" viewBox="0 0 96 88">
        <path d={arcPath(bgStart, bgEnd)} fill="none" stroke="var(--border-hi)" strokeWidth={sw} strokeLinecap="round" />
        {pct > 0.01 && <path d={arcPath(bgStart, valEnd)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" opacity="0.9" />}
        <text x={cx} y={cy - 2} textAnchor="middle" fill="var(--text-hi)" fontSize="20" fontFamily="Outfit" fontWeight="300">{value}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="10" fontFamily="Outfit" fontWeight="300">{unit}</text>
      </svg>
      <span className="svc-gauge-label">{label}</span>
    </div>
  )
}

// ─── GPU Activity Graph ───

function GpuGraph({ history }: { history: number[] }) {
  const W = 800; const H = 60
  if (history.length < 2) {
    return (
      <div className="studio-gpu-graph">
        <div className="studio-gpu-graph-header">
          <Zap size={14} />
          <span>GPU Activity</span>
          <span className="studio-gpu-graph-value">0%</span>
        </div>
        <div className="studio-gpu-graph-wrap">
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <text x={W/2} y={H/2 + 4} textAnchor="middle" fill="var(--text-muted)" fontSize="12" fontFamily="Outfit">Sampling...</text>
          </svg>
        </div>
      </div>
    )
  }

  const maxVal = Math.max(10, ...history) * 1.2
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W
    const y = H - (v / maxVal) * (H - 8) - 4
    return `${x},${y}`
  })
  const areaPoints = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W
    const y = H - (v / maxVal) * (H - 8) - 4
    return { x, y }
  })
  const linePath = `M ${points.join(' L ')}`
  const areaPath = `M ${areaPoints[0].x},${H} L ${areaPoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${areaPoints[areaPoints.length - 1].x},${H} Z`
  const current = history[history.length - 1]
  const lastPt = areaPoints[areaPoints.length - 1]

  return (
    <div className="studio-gpu-graph">
      <div className="studio-gpu-graph-header">
        <Zap size={14} />
        <span>GPU Activity</span>
        <span className="studio-gpu-graph-value">{current}%</span>
      </div>
      <div className="studio-gpu-graph-wrap">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={areaPath} fill="var(--purple)" opacity="0.08" />
          <path d={linePath} fill="none" stroke="var(--purple)" strokeWidth="1.5" opacity="0.7" />
          <circle cx={lastPt.x} cy={lastPt.y} r="3" fill="var(--purple)" opacity="0.9">
            <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
  )
}

// ─── Main Studio Tab ───

export default function MacStudioTab() {
  const [telem, setTelem] = useState<StudioTelemetry | null>(null)
  const [gpuHistory, setGpuHistory] = useState<number[]>([])
  const [unreachable, setUnreachable] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/services/studio')
      const d = await res.json()
      if (d.error || !d.reachable) { setUnreachable(true); return }
      setUnreachable(false)
      setTelem(d)
      setGpuHistory(prev => [...prev.slice(-59), d.gpu.device])
      setLastRefresh(new Date())
    } catch { setUnreachable(true) }
  }, [])

  useEffect(() => {
    fetchTelemetry()
    const iv = setInterval(fetchTelemetry, 6000)
    return () => clearInterval(iv)
  }, [fetchTelemetry])

  if (unreachable) {
    return (
      <div className="studio-unreachable">
        <Server size={24} />
        <div className="studio-unreachable-text">
          <span className="studio-unreachable-title">Mac Studio Offline</span>
          <span className="studio-unreachable-sub">Cannot reach 100.100.179.121 via Tailscale</span>
        </div>
        <button className="svc-btn" onClick={fetchTelemetry}><RefreshCw size={13} /><span>Retry</span></button>
      </div>
    )
  }

  if (!telem) {
    return <div className="svc-telem-loading">Connecting to Mac Studio...</div>
  }

  return (
    <div className="studio-tab">
      {/* Network Heartbeat (shared component) */}
      <Heartbeat />

      {/* GPU Activity Graph */}
      <GpuGraph history={gpuHistory} />

      {/* Gauges: CPU, GPU, RAM, Storage, Power */}
      <div className="svc-gauges svc-gauges--five">
        <Gauge value={telem.cpu.total} max={100} label="CPU" unit="%" color="var(--accent)" />
        <Gauge value={telem.gpu.device} max={100} label="GPU" unit="%" color="var(--purple)" />
        <Gauge value={telem.mem.percent} max={100} label="RAM" unit={`${telem.mem.usedGB}/${telem.mem.totalGB} GB`} color="var(--green)" />
        {telem.disk && <Gauge value={telem.disk.percent} max={100} label="Storage" unit={`${telem.disk.avail} free`} color={telem.disk.percent > 85 ? 'var(--red)' : 'var(--accent-dim)'} />}
        <Gauge value={telem.power?.watts || 0} max={200} label="Power" unit="W" color="var(--purple)" />
      </div>

      {/* Machine info + uptime */}
      <div className="svc-machine-bar"><Cpu size={13} /><span>{telem.machine.chip} &middot; {telem.machine.cores} cores &middot; {telem.machine.ramGB} GB RAM</span></div>
      <div className="studio-uptime-bar">
        <Server size={13} />
        <span>Up {telem.uptime}</span>
        <span className="studio-uptime-load">Load: {telem.loadAvg.map(l => l.toFixed(2)).join(' \u00b7 ')}</span>
      </div>

      <div className="svc-footer-info">
        Last checked {lastRefresh.toLocaleTimeString()} &middot; Auto-refreshes every 6s
      </div>
    </div>
  )
}
