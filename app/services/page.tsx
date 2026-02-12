'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Play, Square, RotateCw, ChevronDown, ChevronRight,
  Globe, Lock, RefreshCw, Database, FileText, Cpu,
  HardDrive, Activity, Zap, Brain, Server, Terminal,
  ArrowDown, ArrowUp, Wrench, Archive, Sparkles, Eye,
  Shield, BookOpen, Copy, Check,
} from 'lucide-react'

// ─── Types ───
interface Service {
  id: string; label: string; plist: string; port: number | null
  type: string; description: string; funnelable: boolean
  status: 'running' | 'stopped' | 'errored'; pid: number | null
  exitCode: number | null; portOpen: boolean; uptime: string | null; isFunneled: boolean
}
interface FunnelInfo { active: boolean; port: number | null; url: string | null }
/* eslint-disable @typescript-eslint/no-explicit-any */
type Telemetry = Record<string, any>

// ─── Service Branding ───

const SERVICE_BRAND: Record<string, {
  icon: React.ReactNode
  wordmark: string
  subtitle: string
  accent: string
  accentDim: string
  className: string
}> = {
  brytools: {
    icon: <Wrench size={18} />,
    wordmark: 'BRYTOOLS',
    subtitle: 'Command Center',
    accent: 'var(--accent)',
    accentDim: 'var(--accent-dim)',
    className: 'svc-brand--brytools',
  },
  'skinwalker-archive': {
    icon: <Eye size={18} />,
    wordmark: 'SKINWALKER',
    subtitle: 'Archive',
    accent: 'var(--green)',
    accentDim: 'rgba(107, 143, 114, 0.5)',
    className: 'svc-brand--skinwalker',
  },
  ollama: {
    icon: <Brain size={18} />,
    wordmark: 'OLLAMA',
    subtitle: 'Neural Engine',
    accent: 'var(--purple, #a78bfa)',
    accentDim: 'rgba(167, 139, 250, 0.4)',
    className: 'svc-brand--ollama',
  },
}

interface HeartbeatSample { ts: number; down: number; up: number }
interface HeartbeatData {
  samples: HeartbeatSample[]
  current: { down: number; up: number; downFmt: string; upFmt: string } | null
}

// ─── Heartbeat EKG ───

function Heartbeat() {
  const [data, setData] = useState<HeartbeatData>({ samples: [], current: null })
  const [speedTest, setSpeedTest] = useState<{
    running: boolean
    phase: string
    result: { download: { fmt: string; mbps: number }; upload: { fmt: string; mbps: number }; ping: number; server?: string; isp?: string } | null
  }>({ running: false, phase: '', result: null })
  const [pollRate, setPollRate] = useState(2000)

  useEffect(() => {
    const fetchBeat = async () => {
      try {
        const fast = pollRate < 2000 ? '?fast=1' : ''
        const res = await fetch(`/api/services/heartbeat${fast}`)
        const d = await res.json()
        setData(d)
      } catch { /* ignore */ }
    }
    fetchBeat()
    const iv = setInterval(fetchBeat, pollRate)
    return () => clearInterval(iv)
  }, [pollRate])

  const runSpeedTest = async () => {
    setSpeedTest({ running: true, phase: 'Finding server...', result: null })
    setPollRate(500)
    try {
      fetch('/api/services/heartbeat?fast=1')
      const phaseTimer = setTimeout(() => setSpeedTest(p => ({ ...p, phase: 'Testing download...' })), 3000)
      const phaseTimer2 = setTimeout(() => setSpeedTest(p => ({ ...p, phase: 'Testing upload...' })), 15000)
      const phaseTimer3 = setTimeout(() => setSpeedTest(p => ({ ...p, phase: 'Finishing up...' })), 28000)
      const res = await fetch('/api/services/speedtest', { method: 'POST' })
      clearTimeout(phaseTimer)
      clearTimeout(phaseTimer2)
      clearTimeout(phaseTimer3)
      const d = await res.json()
      if (d.error) {
        setSpeedTest({ running: false, phase: '', result: null })
      } else {
        setSpeedTest({ running: false, phase: '', result: d })
      }
      setTimeout(() => setPollRate(2000), 3000)
    } catch {
      setSpeedTest({ running: false, phase: '', result: null })
      setPollRate(2000)
    }
  }

  const { samples, current } = data
  const W = 800; const H = 80
  const padL = 0; const padR = 0

  // Auto-scale: find max rate across both directions
  const allRates = samples.flatMap(s => [s.down, s.up])
  const maxRate = Math.max(1024, ...allRates) * 1.2 // at least 1KB/s scale, 20% headroom

  // Build SVG paths
  const buildPath = (getValue: (s: HeartbeatSample) => number): string => {
    if (samples.length < 2) return ''
    const points = samples.map((s, i) => {
      const x = padL + (i / (60 - 1)) * (W - padL - padR)
      const val = getValue(s)
      const y = H / 2 - (val / maxRate) * (H / 2 - 4)
      return `${x},${Math.max(4, Math.min(H - 4, y))}`
    })
    return `M ${points.join(' L ')}`
  }

  const buildArea = (getValue: (s: HeartbeatSample) => number, flip: boolean): string => {
    if (samples.length < 2) return ''
    const baseline = H / 2
    const points = samples.map((s, i) => {
      const x = padL + (i / (60 - 1)) * (W - padL - padR)
      const val = getValue(s)
      const offset = (val / maxRate) * (H / 2 - 4)
      const y = flip ? baseline + offset : baseline - offset
      return { x, y: Math.max(4, Math.min(H - 4, y)) }
    })
    const forward = points.map(p => `${p.x},${p.y}`).join(' L ')
    const backX0 = points[0].x
    const backX1 = points[points.length - 1].x
    return `M ${backX0},${baseline} L ${forward} L ${backX1},${baseline} Z`
  }

  const downPath = buildPath(s => s.down)
  const upPath = buildPath(s => s.up)
  const downArea = buildArea(s => s.down, false)
  const upArea = buildArea(s => s.up, true)

  const isAlive = samples.length >= 2

  return (
    <div className="heartbeat">
      <div className="heartbeat-header">
        <div className="heartbeat-title">
          <Activity size={14} />
          <span>Network</span>
        </div>
        <div className="heartbeat-actions">
          <div className="heartbeat-rates">
            <div className="heartbeat-rate heartbeat-rate--down">
              <ArrowDown size={12} />
              <span>{current?.downFmt || '0 B/s'}</span>
            </div>
            <div className="heartbeat-rate heartbeat-rate--up">
              <ArrowUp size={12} />
              <span>{current?.upFmt || '0 B/s'}</span>
            </div>
          </div>
          <button
            className={`svc-btn heartbeat-speedtest-btn ${speedTest.running ? 'heartbeat-speedtest-btn--running' : ''}`}
            onClick={runSpeedTest}
            disabled={speedTest.running}
          >
            <Zap size={12} />
            <span>{speedTest.running ? speedTest.phase : 'Speed Test'}</span>
          </button>
        </div>
      </div>
      <div className="heartbeat-graph">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {/* Center baseline */}
          <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4 4" />
          {isAlive && (
            <>
              {/* Download (above center) */}
              <path d={downArea} fill="var(--accent)" opacity="0.08" />
              <path d={downPath} fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.7" />
              {/* Upload (below center) */}
              <path d={upArea} fill="var(--green)" opacity="0.06" />
              <path d={upPath} fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.6" />
              {/* Glow dot at latest point */}
              {samples.length > 0 && (() => {
                const last = samples[samples.length - 1]
                const x = W - padR
                const yDown = H/2 - (last.down / maxRate) * (H/2 - 4)
                const yUp = H/2 + (last.up / maxRate) * (H/2 - 4)
                return (
                  <>
                    <circle cx={x} cy={Math.max(4, Math.min(H-4, yDown))} r="3" fill="var(--accent)" opacity="0.9">
                      <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={x} cy={Math.max(4, Math.min(H-4, yUp))} r="3" fill="var(--green)" opacity="0.9">
                      <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </>
                )
              })()}
            </>
          )}
          {!isAlive && (
            <text x={W/2} y={H/2 + 4} textAnchor="middle" fill="var(--text-muted)" fontSize="12" fontFamily="Outfit">
              Sampling...
            </text>
          )}
        </svg>
      </div>
      {(speedTest.running || speedTest.result) && (
        <div className="speedtest-results">
          <div className="speedtest-stats-row">
            <div className="speedtest-stat">
              <ArrowDown size={13} />
              <span className="speedtest-value">
                {speedTest.result ? speedTest.result.download.fmt : '...'}
              </span>
              <span className="speedtest-label">Down</span>
            </div>
            <div className="speedtest-divider" />
            <div className="speedtest-stat">
              <ArrowUp size={13} />
              <span className="speedtest-value">
                {speedTest.result ? speedTest.result.upload.fmt : '...'}
              </span>
              <span className="speedtest-label">Up</span>
            </div>
            <div className="speedtest-divider" />
            <div className="speedtest-stat">
              <Activity size={13} />
              <span className="speedtest-value">
                {speedTest.result ? `${speedTest.result.ping} ms` : '...'}
              </span>
              <span className="speedtest-label">Ping</span>
            </div>
          </div>
          {speedTest.result?.server && (
            <div className="speedtest-server">
              <Globe size={11} />
              <span>{speedTest.result.server}</span>
              {speedTest.result.isp && <span className="speedtest-isp">via {speedTest.result.isp}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Gauge Component ───
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

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return <div className="svc-mini-bar"><div className="svc-mini-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="svc-stat">
      <div className="svc-stat-icon">{icon}</div>
      <div className="svc-stat-text">
        <div className="svc-stat-value">{value}</div>
        <div className="svc-stat-label">{label}</div>
        {sub && <div className="svc-stat-sub">{sub}</div>}
      </div>
    </div>
  )
}

// ─── Collapsible Log Tail ───
function LogTail({ logs, plist }: { logs: string[]; plist: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="svc-log-section">
      <div className="svc-log-toggle" onClick={() => setOpen(!open)}>
        <Terminal size={12} />
        <span>Log tail</span>
        <span className="svc-log-plist">{plist}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>
      {open && <pre className="svc-log-content">{logs.join('\n')}</pre>}
    </div>
  )
}

// ─── Helpers ───
function formatUptime(raw: string | null): string {
  if (!raw) return ''
  const t = raw.trim()
  if (t.includes('-')) { const [d, ti] = t.split('-'); return `${d}d ${ti.split(':')[0]}h` }
  const p = t.split(':')
  if (p.length === 3) { const h = parseInt(p[0]); const m = parseInt(p[1]); return h > 0 ? `${h}h ${m}m` : `${m}m` }
  if (p.length === 2) { const m = parseInt(p[0]); return m > 0 ? `${m}m ${parseInt(p[1])}s` : `${parseInt(p[1])}s` }
  return t
}
function formatBytes(b: number): string {
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}
function statusLabel(s: Service): string {
  if (s.status === 'running') return s.port && !s.portOpen ? 'Starting' : 'Running'
  if (s.status === 'errored') return `Errored (exit ${s.exitCode})`
  return 'Stopped'
}
function statusColor(s: Service): string {
  if (s.status === 'running' && (!s.port || s.portOpen)) return 'var(--green)'
  if (s.status === 'errored') return 'var(--red)'
  if (s.status === 'running') return 'var(--accent)'
  return 'var(--text-muted)'
}

// ─── Panel Renderers ───

function SkinwalkerPanel({ telemetry: t, logs, plist }: { telemetry: Telemetry; logs: string[]; plist: string }) {
  if (!t?.canonEntries) return <div className="svc-telem-loading">Collecting telemetry...</div>
  const lucid = t.lucidLink
  return (
    <div className="svc-telem">
      {/* LucidLink status bar */}
      <div className={`svc-volume-alert ${lucid?.mounted ? 'svc-volume-alert--ok' : 'svc-volume-alert--warn'}`}>
        <HardDrive size={14} />
        <span className="svc-volume-alert-label">LucidLink</span>
        <span className="svc-volume-alert-status">{lucid?.mounted ? 'Mounted' : 'NOT MOUNTED'}</span>
        {lucid?.mounted && lucid?.avail && <span className="svc-volume-alert-detail">{lucid.avail} free of {lucid.total}</span>}
      </div>
      <div className="svc-telem-grid">
        <Stat icon={<Database size={16} />} label="Canon Entries" value={t.canonEntries.toLocaleString()} sub="JSON documents indexed" />
        <Stat icon={<FileText size={16} />} label="Source Scripts" value={t.sourceFiles} sub="Master documents" />
        <Stat icon={<Activity size={16} />} label="Recent Requests" value={t.recentPosts + t.recentGets} sub={`${t.recentPosts} POST · ${t.recentGets} GET`} />
        <Stat icon={<Zap size={16} />} label="Memory" value={t.memory || 'N/A'} sub={`${t.connections} active conn`} />
      </div>
      {t.recentActivity?.length > 0 && (
        <div className="svc-activity">
          <div className="svc-activity-label">Recent Activity</div>
          <div className="svc-activity-list">
            {t.recentActivity.slice(-5).map((line: string, i: number) => (
              <div key={i} className="svc-activity-line">{line}</div>
            ))}
          </div>
        </div>
      )}
      <LogTail logs={logs} plist={plist} />
    </div>
  )
}

function BrytoolsPanel({ telemetry: t, logs, plist }: { telemetry: Telemetry; logs: string[]; plist: string }) {
  if (!t?.system) return <div className="svc-telem-loading">Collecting telemetry...</div>
  const sys = t.system
  return (
    <div className="svc-telem">
      <Heartbeat />
      <div className="svc-gauges">
        <Gauge value={sys.cpu.total} max={100} label="CPU" unit="%" color="var(--accent)" />
        <Gauge value={sys.mem.percent} max={100} label="RAM" unit={`${sys.mem.usedGB}/${sys.mem.totalGB} GB`} color="var(--green)" />
        {sys.disk && <Gauge value={sys.disk.percent} max={100} label="Storage" unit={`${sys.disk.avail} free`} color={sys.disk.percent > 85 ? 'var(--red)' : 'var(--accent-dim)'} />}
      </div>
      <div className="svc-telem-grid">
        <Stat icon={<Server size={16} />} label="Uptime" value={t.uptime} sub={`Load: ${t.loadAvg.map((l: number) => l.toFixed(2)).join(' · ')}`} />
        <Stat icon={<HardDrive size={16} />} label="Downloads" value={t.downloads.count} sub={t.downloads.totalBytes > 0 ? formatBytes(t.downloads.totalBytes) + ' total' : 'No downloads yet'} />
        <Stat icon={<FileText size={16} />} label="Transcripts" value={t.transcripts.completed} sub={`${t.transcripts.sources} source files`} />
        <Stat icon={<Database size={16} />} label="Dump Folder" value={t.dumpSize} sub="Total download storage" />
      </div>
      <div className="svc-machine-bar"><Cpu size={13} /><span>Mac Mini M2 Pro · 12 cores · 32 GB RAM</span></div>
      {/* Volumes */}
      {t.volumes && t.volumes.length > 0 && (
        <div className="svc-volumes">
          <div className="svc-activity-label">Mounted Volumes</div>
          {t.volumes.map((v: any, i: number) => (
            <div key={i} className={`svc-volume-row ${!v.mounted ? 'svc-volume-row--unmounted' : ''}`}>
              <div className="svc-volume-left">
                <HardDrive size={13} />
                <span className="svc-volume-name">{v.label}</span>
                {v.mounted
                  ? <span className="svc-volume-mounted">Mounted</span>
                  : <span className="svc-volume-unmounted">OFFLINE</span>
                }
              </div>
              {v.mounted && v.percent != null && (
                <div className="svc-volume-right">
                  <span className="svc-volume-detail">{v.avail} free of {v.total}</span>
                  <div className="svc-volume-bar">
                    <div className="svc-volume-bar-fill" style={{ width: `${v.percent}%`, background: v.percent > 85 ? 'var(--red)' : 'var(--accent-dim)' }} />
                  </div>
                  <span className="svc-volume-pct">{v.percent}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <LogTail logs={logs} plist={plist} />
    </div>
  )
}

function OllamaPanel({ telemetry: t, logs, plist }: { telemetry: Telemetry; logs: string[]; plist: string }) {
  if (!t?.models) return <div className="svc-telem-loading">Collecting telemetry...</div>
  const hasRunning = t.runningModels?.length > 0
  return (
    <div className="svc-telem">
      <div className="svc-telem-grid">
        <Stat icon={<Brain size={16} />} label="Models Installed" value={t.models.length} sub={t.models.map((m: any) => m.name).join(', ') || 'None'} />
        <Stat icon={<Zap size={16} />} label="Status" value={hasRunning ? 'Model Loaded' : 'Idle'} sub={hasRunning ? t.runningModels[0].name : 'No model in memory'} />
        <Stat icon={<Activity size={16} />} label="Process Memory" value={t.memory || 'N/A'} sub={hasRunning ? `VRAM: ${t.runningModels[0].vramPercent}%` : 'Baseline'} />
      </div>
      {t.models.length > 0 && (
        <div className="svc-model-list">
          <div className="svc-activity-label">Model Inventory</div>
          {t.models.map((m: any, i: number) => (
            <div key={i} className="svc-model-row">
              <div className="svc-model-name">
                <Brain size={13} />
                <span>{m.name}</span>
                {hasRunning && t.runningModels.some((r: any) => r.name === m.name) && (
                  <span className="svc-model-active-badge">Active</span>
                )}
              </div>
              <div className="svc-model-specs">
                <span>{m.params}</span><span className="svc-model-divider">·</span>
                <span>{m.quant}</span><span className="svc-model-divider">·</span>
                <span>{m.size}</span><span className="svc-model-divider">·</span>
                <span>{m.family}</span>
              </div>
              <MiniBar value={parseFloat(m.size)} max={32} color="var(--accent-dim)" />
            </div>
          ))}
        </div>
      )}
      <LogTail logs={logs} plist={plist} />
    </div>
  )
}

// ─── Watchdog Panel ───

interface Incident { ts: string; service: string; event: string }

function WatchdogPanel() {
  const [alertTo, setAlertTo] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [saving, setSaving] = useState(false)
  const [testSent, setTestSent] = useState(false)

  useEffect(() => {
    fetch('/api/services/watchdog').then(r => r.json()).then(d => {
      setAlertTo(d.alertTo || '')
      setInputVal(d.alertTo || '')
      setEnabled(d.enabled)
    }).catch(() => {})
    fetch('/api/services/incidents').then(r => r.json()).then(d => {
      setIncidents(d.incidents || [])
    }).catch(() => {})
  }, [])

  const savePhone = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/services/watchdog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertTo: inputVal })
      })
      const d = await res.json()
      if (d.ok) { setAlertTo(d.alertTo); setEnabled(!!d.alertTo) }
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const sendTest = async () => {
    setTestSent(false)
    try {
      await fetch('/api/services/watchdog/test', { method: 'POST' })
      setTestSent(true)
      setTimeout(() => setTestSent(false), 5000)
    } catch { /* ignore */ }
  }

  const formatTs = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    } catch { return ts }
  }

  const eventIcon = (event: string) => event === 'recovered' ? '✅' : '🔴'
  const eventLabel = (event: string, service: string) => {
    const names: Record<string, string> = {
      brytools: 'BryTools', skinwalker: 'Skinwalker Archive', ollama: 'Ollama',
      lucidlink: 'LucidLink', vol_rowmedia: 'RowMedia',
    }
    const name = names[service] || service
    return event === 'recovered' ? `${name} recovered` : `${name} went down`
  }

  return (
    <div className="section" style={{ marginTop: 16 }}>
      <div className="section-label"><span>Watchdog</span></div>
      <div className="svc-service-block">
        <div className="svc-watchdog-config">
          <div className="svc-watchdog-row">
            <div className="svc-watchdog-label">
              <Activity size={14} />
              <span>iMessage Alerts</span>
              <span className={`svc-watchdog-status ${enabled ? 'svc-watchdog-status--on' : ''}`}>
                {enabled ? 'Active' : 'Not configured'}
              </span>
            </div>
          </div>
          <div className="svc-watchdog-row">
            <input
              className="svc-watchdog-input"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
            />
            <button className="svc-btn" onClick={savePhone} disabled={saving || inputVal === alertTo}>
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
            {enabled && (
              <button className="svc-btn" onClick={sendTest}>
                <span>{testSent ? 'Sent!' : 'Test'}</span>
              </button>
            )}
          </div>
          <div className="svc-watchdog-hint">
            Checks every 60s. Alerts on service crashes, LucidLink disconnects, volume failures. 5min cooldown between repeat alerts.
          </div>
        </div>

        {incidents.length > 0 && (
          <div className="svc-incidents">
            <div className="svc-activity-label">Incident History</div>
            {incidents.map((inc, i) => (
              <div key={i} className="svc-incident-row">
                <span className="svc-incident-icon">{eventIcon(inc.event)}</span>
                <span className="svc-incident-text">{eventLabel(inc.event, inc.service)}</span>
                <span className="svc-incident-time">{formatTs(inc.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [funnel, setFunnel] = useState<FunnelInfo>({ active: false, port: null, url: null })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()) // track collapsed (all open by default)
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({})
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/services')
      const data = await res.json()
      setServices(data.services)
      setFunnel(data.funnel)
      setLastRefresh(new Date())
    } catch (err) { console.error('Failed:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStatus(); const iv = setInterval(fetchStatus, 10000); return () => clearInterval(iv) }, [fetchStatus])

  // Fetch telemetry for all expanded services
  useEffect(() => {
    if (services.length === 0) return
    const expandedIds = services.map(s => s.id).filter(id => !collapsed.has(id))
    if (expandedIds.length === 0) return

    const fetchAll = async () => {
      for (const id of expandedIds) {
        try {
          const res = await fetch(`/api/services/logs?id=${id}`)
          const data = await res.json()
          setLogs(prev => ({ ...prev, [id]: data.lines }))
          if (data.telemetry) setTelemetry(prev => ({ ...prev, [id]: data.telemetry }))
        } catch { /* ignore */ }
      }
    }
    fetchAll()
    const iv = setInterval(fetchAll, 6000)
    return () => clearInterval(iv)
  }, [services, collapsed])

  const doAction = async (id: string, action: string) => {
    setActionPending(`${id}-${action}`); setConfirmAction(null)
    try {
      const res = await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
      const data = await res.json()
      if (data.funnel) setFunnel(data.funnel)
      await fetchStatus()
    } catch (err) { console.error('Action failed:', err) }
    finally { setActionPending(null) }
  }

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const renderPanel = (svc: Service) => {
    const svcLogs = logs[svc.id] || ['Loading...']
    const svcTelem = telemetry[svc.id] || {}
    switch (svc.id) {
      case 'skinwalker-archive': return <SkinwalkerPanel telemetry={svcTelem} logs={svcLogs} plist={svc.plist} />
      case 'brytools': return <BrytoolsPanel telemetry={svcTelem} logs={svcLogs} plist={svc.plist} />
      case 'ollama': return <OllamaPanel telemetry={svcTelem} logs={svcLogs} plist={svc.plist} />
      default: return null
    }
  }

  return (
    <div className="services-page">
      <div className="section">
        <div className="section-label">
          <span>Services</span>
          <span className="section-count">{services.filter(s => s.status === 'running' && (!s.port || s.portOpen)).length} of {services.length} active</span>
          <button className="svc-refresh-btn" onClick={() => fetchStatus()} title="Refresh now"><RefreshCw size={13} /></button>
        </div>

        {loading ? (
          <div className="svc-loading">Loading services...</div>
        ) : (
          <>
          <div className="svc-service-list">
            {services.map(svc => {
              const isOpen = !collapsed.has(svc.id)
              const isPending = actionPending?.startsWith(svc.id)
              const isConfirming = confirmAction?.id === svc.id
              const isRunning = svc.status === 'running'

              return (
                <div key={svc.id} className={`svc-service-block ${(SERVICE_BRAND[svc.id] || {}).className || ''}`}>
                  {/* Branded Header */}
                  <div className={`svc-header ${isOpen ? 'svc-header--open' : ''}`}>
                    <div className="svc-header-left" onClick={() => toggleCollapse(svc.id)} style={{ cursor: 'pointer' }}>
                      <div className={`svc-dot ${svc.status === 'running' && (!svc.port || svc.portOpen) ? 'svc-dot--alive' : ''}`} style={{ background: statusColor(svc) }} />
                      {SERVICE_BRAND[svc.id] ? (
                        <div className="svc-header-info">
                          <div className="svc-brand-wordmark">
                            <span className="svc-brand-icon">{SERVICE_BRAND[svc.id].icon}</span>
                            <span className="svc-brand-name">{SERVICE_BRAND[svc.id].wordmark}</span>
                            <span className="svc-brand-sub">{SERVICE_BRAND[svc.id].subtitle}</span>
                          </div>
                          <span className="svc-header-detail">
                            {statusLabel(svc)}
                            {svc.uptime && svc.status === 'running' ? ` · ${formatUptime(svc.uptime)}` : ''}
                            {svc.port ? ` · :${svc.port}` : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="svc-header-info">
                          <span className="svc-header-name">{svc.label}</span>
                          <span className="svc-header-detail">
                            {statusLabel(svc)}
                            {svc.uptime && svc.status === 'running' ? ` · ${formatUptime(svc.uptime)}` : ''}
                            {svc.port ? ` · :${svc.port}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="svc-header-right">
                      {svc.funnelable && isRunning && (
                        <button
                          className={`svc-access-toggle ${svc.isFunneled ? 'svc-access-toggle--public' : ''}`}
                          onClick={() => doAction(svc.id, svc.isFunneled ? 'funnel-off' : 'funnel-on')}
                          disabled={isPending || false}
                        >
                          {svc.isFunneled ? <Globe size={12} /> : <Lock size={12} />}
                          <span>{svc.isFunneled ? 'Public' : 'Private'}</span>
                        </button>
                      )}
                      <div className="row-badge">{svc.type}</div>
                      {isPending ? (
                        <div className="svc-spinner"><RotateCw size={14} /></div>
                      ) : isConfirming ? (
                        <div className="confirm-group">
                          <button className="btn-confirm-delete" onClick={() => doAction(confirmAction.id, confirmAction.action)}>
                            {confirmAction.action === 'stop' ? 'Stop' : 'Restart'}
                          </button>
                          <button className="btn-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="svc-btns">
                          {!isRunning && <button className="svc-btn" onClick={() => doAction(svc.id, 'start')}><Play size={13} /><span>Start</span></button>}
                          {isRunning && (
                            <>
                              <button className="svc-btn" onClick={() => setConfirmAction({ id: svc.id, action: 'restart' })} title="Restart"><RotateCw size={13} /></button>
                              <button className="svc-btn svc-btn--stop" onClick={() => setConfirmAction({ id: svc.id, action: 'stop' })} title="Stop"><Square size={13} /></button>
                            </>
                          )}
                          {!isRunning && svc.status === 'errored' && <button className="svc-btn" onClick={() => doAction(svc.id, 'restart')}><RotateCw size={13} /><span>Restart</span></button>}
                        </div>
                      )}
                      <div className="svc-expand-toggle" onClick={() => toggleCollapse(svc.id)} style={{ cursor: 'pointer' }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>
                  </div>

                  {svc.isFunneled && funnel.url && (
                    <div className="svc-funnel-url-bar">
                      <Globe size={12} />
                      <span>{funnel.url}</span>
                      <button
                        className="svc-copy-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          const text = funnel.url!
                          // Fallback for non-HTTPS contexts
                          const ta = document.createElement('textarea')
                          ta.value = text
                          ta.style.position = 'fixed'
                          ta.style.opacity = '0'
                          document.body.appendChild(ta)
                          ta.select()
                          document.execCommand('copy')
                          document.body.removeChild(ta)
                          const btn = e.currentTarget
                          btn.classList.add('svc-copy-btn--copied')
                          setTimeout(() => btn.classList.remove('svc-copy-btn--copied'), 1500)
                        }}
                        title="Copy URL"
                      >
                        <Copy size={12} className="svc-copy-icon" />
                        <Check size={12} className="svc-check-icon" />
                      </button>
                    </div>
                  )}

                  {isOpen && <div className="svc-expanded-panel">{renderPanel(svc)}</div>}
                </div>
              )
            })}
          </div>
          </>
        )}
      </div>

      <WatchdogPanel />

      <div className="svc-footer-info">
        Last checked {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 10s
      </div>
    </div>
  )
}
