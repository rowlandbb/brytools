'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Play, Square, RotateCw, ChevronDown, ChevronRight,
  RefreshCw, Brain, Server, Terminal, Activity, Zap,
  Cpu, HardDrive,
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

interface OllamaTelemetry {
  models: { name: string; size: string; family: string; params: string; quant: string }[]
  runningModels: { name: string; size: string; vramPercent: number }[]
  memory: string | null
}

interface OllamaService {
  status: 'running' | 'stopped' | 'errored'
  portOpen: boolean
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

// ─── Log Tail ───

function LogTail({ logs, label }: { logs: string[]; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="svc-log-section">
      <div className="svc-log-toggle" onClick={() => setOpen(!open)}>
        <Terminal size={12} />
        <span>Log tail</span>
        <span className="svc-log-plist">{label}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>
      {open && <pre className="svc-log-content">{logs.join('\n')}</pre>}
    </div>
  )
}

// ─── Model Grid ───

function ModelGrid({ models, runningModels }: { models: any[]; runningModels: any[] }) {
  const runningNames = new Set(runningModels.map((r: any) => r.name))
  return (
    <div className="studio-model-grid">
      {models.map((m: any, i: number) => {
        const isActive = runningNames.has(m.name)
        return (
          <div key={i} className={`studio-model-tile ${isActive ? 'studio-model-tile--active' : ''}`}>
            <div className="studio-model-tile-header">
              <Brain size={13} />
              <span className="studio-model-tile-name">{m.name.split(':')[0]}</span>
              {isActive && <span className="studio-model-tile-badge">Active</span>}
            </div>
            <div className="studio-model-tile-specs">
              <span>{m.params}</span>
              <span className="svc-model-divider">&middot;</span>
              <span>{m.quant}</span>
              <span className="svc-model-divider">&middot;</span>
              <span>{m.size}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Studio Tab ───

export default function MacStudioTab() {
  const [telem, setTelem] = useState<StudioTelemetry | null>(null)
  const [ollama, setOllama] = useState<OllamaTelemetry | null>(null)
  const [ollamaStatus, setOllamaStatus] = useState<OllamaService | null>(null)
  const [ollamaLogs, setOllamaLogs] = useState<string[]>([])
  const [gpuHistory, setGpuHistory] = useState<number[]>([])
  const [unreachable, setUnreachable] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const [ollamaOpen, setOllamaOpen] = useState(true)

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

  const fetchOllama = useCallback(async () => {
    try {
      // Get ollama service status
      const svcRes = await fetch('/api/services')
      const svcData = await svcRes.json()
      const ollamaSvc = svcData.services?.find((s: any) => s.id === 'ollama')
      if (ollamaSvc) setOllamaStatus(ollamaSvc)

      // Get ollama telemetry + logs
      const logRes = await fetch('/api/services/logs?id=ollama')
      const logData = await logRes.json()
      if (logData.telemetry) setOllama(logData.telemetry)
      if (logData.lines) setOllamaLogs(logData.lines)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchTelemetry()
    fetchOllama()
    const iv1 = setInterval(fetchTelemetry, 6000)
    const iv2 = setInterval(fetchOllama, 8000)
    return () => { clearInterval(iv1); clearInterval(iv2) }
  }, [fetchTelemetry, fetchOllama])

  const doOllamaAction = async (action: string) => {
    setActionPending(action); setConfirmAction(null)
    try {
      await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'ollama', action }) })
      await fetchOllama()
    } catch { /* ignore */ }
    finally { setActionPending(null) }
  }

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

  const isOllamaRunning = ollamaStatus?.status === 'running'
  const hasRunning = (ollama?.runningModels?.length || 0) > 0

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

      {/* Ollama Service Panel */}
      <div className="svc-service-block svc-brand--ollama" style={{ marginTop: 16 }}>
        <div className={`svc-header ${ollamaOpen ? 'svc-header--open' : ''}`}>
          <div className="svc-header-left" onClick={() => setOllamaOpen(!ollamaOpen)} style={{ cursor: 'pointer' }}>
            <div className={`svc-dot ${isOllamaRunning ? 'svc-dot--alive' : ''}`} style={{ background: isOllamaRunning ? 'var(--green)' : 'var(--text-muted)' }} />
            <div className="svc-header-info">
              <div className="svc-brand-wordmark">
                <span className="svc-brand-icon"><Brain size={18} /></span>
                <span className="svc-brand-name">OLLAMA</span>
                <span className="svc-brand-sub">Inference</span>
              </div>
              <span className="svc-header-detail">
                {isOllamaRunning ? 'Running' : 'Stopped'}
                {hasRunning ? ` \u00b7 ${ollama!.runningModels[0].name}` : ''}
                {ollama?.memory ? ` \u00b7 ${ollama.memory}` : ''}
              </span>
            </div>
          </div>
          <div className="svc-header-right">
            {actionPending ? (
              <div className="svc-spinner"><RotateCw size={14} /></div>
            ) : confirmAction ? (
              <div className="confirm-group">
                <button className="btn-confirm-delete" onClick={() => doOllamaAction(confirmAction)}>
                  {confirmAction === 'stop' ? 'Stop' : 'Restart'}
                </button>
                <button className="btn-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
              </div>
            ) : (
              <div className="svc-btns">
                {!isOllamaRunning && <button className="svc-btn" onClick={() => doOllamaAction('start')}><Play size={13} /><span>Start</span></button>}
                {isOllamaRunning && (
                  <>
                    <button className="svc-btn" onClick={() => setConfirmAction('restart')} title="Restart"><RotateCw size={13} /></button>
                    <button className="svc-btn svc-btn--stop" onClick={() => setConfirmAction('stop')} title="Stop"><Square size={13} /></button>
                  </>
                )}
              </div>
            )}
            <div className="svc-expand-toggle" onClick={() => setOllamaOpen(!ollamaOpen)} style={{ cursor: 'pointer' }}>
              {ollamaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </div>
        </div>

        {ollamaOpen && ollama && (
          <div className="svc-expanded-panel">
            <div className="svc-telem">
              {/* Stats row */}
              <div className="svc-telem-grid">
                <div className="svc-stat">
                  <div className="svc-stat-icon"><Brain size={16} /></div>
                  <div className="svc-stat-text">
                    <div className="svc-stat-value">{ollama.models.length}</div>
                    <div className="svc-stat-label">Models</div>
                  </div>
                </div>
                <div className="svc-stat">
                  <div className="svc-stat-icon"><Zap size={16} /></div>
                  <div className="svc-stat-text">
                    <div className="svc-stat-value">{hasRunning ? 'Loaded' : 'Idle'}</div>
                    <div className="svc-stat-label">Status</div>
                    {hasRunning && <div className="svc-stat-sub">{ollama.runningModels[0].name}</div>}
                  </div>
                </div>
                <div className="svc-stat">
                  <div className="svc-stat-icon"><Activity size={16} /></div>
                  <div className="svc-stat-text">
                    <div className="svc-stat-value">{telem.gpu.allocGB} GB</div>
                    <div className="svc-stat-label">GPU Alloc</div>
                    <div className="svc-stat-sub">of {telem.machine.ramGB} GB unified</div>
                  </div>
                </div>
              </div>

              {/* Model Grid */}
              {ollama.models.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="svc-activity-label">Model Inventory</div>
                  <ModelGrid models={ollama.models} runningModels={ollama.runningModels} />
                </div>
              )}

              <LogTail logs={ollamaLogs} label="ollama.log" />
            </div>
          </div>
        )}
      </div>

      <div className="svc-footer-info">
        Last checked {lastRefresh.toLocaleTimeString()} &middot; Auto-refreshes every 6s
      </div>
    </div>
  )
}
