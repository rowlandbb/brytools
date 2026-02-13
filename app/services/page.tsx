'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Play, Square, RotateCw, ChevronDown, ChevronRight,
  Globe, Lock, RefreshCw, Database, FileText, Cpu,
  HardDrive, Activity, Zap, Brain, Server, Terminal,
  Wrench, Eye, Copy, Check, Monitor,
} from 'lucide-react'
import MacStudioTab from './mac-studio-tab'
import Heartbeat from './heartbeat'

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
    subtitle: 'Mac Studio',
    accent: 'var(--purple, #a78bfa)',
    accentDim: 'rgba(167, 139, 250, 0.4)',
    className: 'svc-brand--ollama',
  },
}

// Heartbeat imported from ./heartbeat.tsx

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
function isRemote(s: Service): boolean {
  return s.type === 'Mac Studio'
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
      <div className="svc-gauges svc-gauges--four">
        <Gauge value={sys.cpu.total} max={100} label="CPU" unit="%" color="var(--accent)" />
        <Gauge value={sys.gpu?.device || 0} max={100} label="GPU" unit="%" color="var(--purple, #a78bfa)" />
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
  const [toggling, setToggling] = useState(false)

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

  const toggleWatchdog = async () => {
    setToggling(true)
    try {
      const res = await fetch('/api/services/watchdog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' })
      })
      const d = await res.json()
      if (d.ok) setEnabled(d.enabled)
    } catch { /* ignore */ }
    finally { setToggling(false) }
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
      <div className="section-label">
        <span>Watchdog</span>
        <span className={`svc-watchdog-status ${enabled ? 'svc-watchdog-status--on' : ''}`}>
          {enabled ? 'Running' : 'Disabled'}
        </span>
        <button
          className={`svc-btn ${enabled ? 'svc-btn--stop' : ''}`}
          onClick={toggleWatchdog}
          disabled={toggling}
          style={{ marginLeft: 'auto' }}
        >
          <span>{toggling ? '...' : enabled ? 'Disable' : 'Enable'}</span>
        </button>
      </div>
      <div className="svc-service-block">
        <div className="svc-watchdog-config">
          <div className="svc-watchdog-row">
            <div className="svc-watchdog-label">
              <Activity size={14} />
              <span>iMessage Alerts</span>
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
            {incidents.slice(-5).map((inc, i) => (
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
  const [machineTab, setMachineTab] = useState<'mini' | 'studio'>('mini')
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

  // Services for collapsible panels (Skinwalker only on Mini)
  const miniPanelServices = services.filter(s => s.id === 'skinwalker-archive')
  // BryTools telemetry for top-level system display
  const brytoolsTelem = telemetry['brytools'] || {}
  const brytoolsSys = brytoolsTelem?.system

  return (
    <div className="services-page">
      {/* Machine Sub-Tabs */}
      <div className="machine-tabs">
        <button
          className={`machine-tab ${machineTab === 'mini' ? 'machine-tab--active' : ''}`}
          onClick={() => setMachineTab('mini')}
        >
          <Server size={14} />
          <span>Mac Mini</span>
        </button>
        <button
          className={`machine-tab machine-tab--studio ${machineTab === 'studio' ? 'machine-tab--active' : ''}`}
          onClick={() => setMachineTab('studio')}
        >
          <Monitor size={14} />
          <span>Mac Studio</span>
        </button>
      </div>

      {machineTab === 'studio' ? (
        <MacStudioTab />
      ) : (
      <div className="mini-tab">
        {/* Network Heartbeat */}
        <Heartbeat />

        {/* Gauges: CPU, GPU, RAM, Storage */}
        {brytoolsSys ? (
          <div className="svc-gauges svc-gauges--four">
            <Gauge value={brytoolsSys.cpu.total} max={100} label="CPU" unit="%" color="var(--accent)" />
            <Gauge value={brytoolsSys.gpu?.device || 0} max={100} label="GPU" unit="%" color="var(--purple, #a78bfa)" />
            <Gauge value={brytoolsSys.mem.percent} max={100} label="RAM" unit={`${brytoolsSys.mem.usedGB}/${brytoolsSys.mem.totalGB} GB`} color="var(--green)" />
            {brytoolsSys.disk && <Gauge value={brytoolsSys.disk.percent} max={100} label="Storage" unit={`${brytoolsSys.disk.avail} free`} color={brytoolsSys.disk.percent > 85 ? 'var(--red)' : 'var(--accent-dim)'} />}
          </div>
        ) : (
          <div className="svc-gauges svc-gauges--four">
            <Gauge value={0} max={100} label="CPU" unit="%" color="var(--accent)" />
            <Gauge value={0} max={100} label="GPU" unit="%" color="var(--purple, #a78bfa)" />
            <Gauge value={0} max={100} label="RAM" unit="..." color="var(--green)" />
            <Gauge value={0} max={100} label="Storage" unit="..." color="var(--accent-dim)" />
          </div>
        )}

        {/* Machine info + uptime */}
        <div className="svc-machine-bar"><Cpu size={13} /><span>Mac Mini M2 Pro &middot; 12 cores &middot; 32 GB RAM</span></div>
        {brytoolsTelem?.uptime && (
          <div className="studio-uptime-bar">
            <Server size={13} />
            <span>Up {brytoolsTelem.uptime}</span>
            <span className="studio-uptime-load">Load: {brytoolsTelem.loadAvg?.map((l: number) => l.toFixed(2)).join(' \u00b7 ')}</span>
          </div>
        )}

        {/* Stats grid */}
        {brytoolsTelem?.downloads && (
          <div className="svc-telem-grid" style={{ border: '1px solid var(--border)', borderTop: 'none', background: 'var(--surface)' }}>
            <Stat icon={<HardDrive size={16} />} label="Downloads" value={brytoolsTelem.downloads.count} sub={brytoolsTelem.downloads.totalBytes > 0 ? formatBytes(brytoolsTelem.downloads.totalBytes) + ' total' : 'No downloads yet'} />
            <Stat icon={<FileText size={16} />} label="Transcripts" value={brytoolsTelem.transcripts.completed} sub={`${brytoolsTelem.transcripts.sources} source files`} />
            <Stat icon={<Database size={16} />} label="Dump Folder" value={brytoolsTelem.dumpSize} sub="Total download storage" />
          </div>
        )}

        {/* Volumes */}
        {brytoolsTelem?.volumes && brytoolsTelem.volumes.length > 0 && (
          <div className="svc-volumes" style={{ border: '1px solid var(--border)', borderTop: 'none', background: 'var(--surface)' }}>
            <div className="svc-activity-label">Mounted Volumes</div>
            {brytoolsTelem.volumes.map((v: any, i: number) => (
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

        {/* Services — collapsible panels */}
        <div className="section" style={{ marginTop: 16 }}>
          <div className="section-label">
            <span>Services</span>
            <span className="section-count">{miniPanelServices.filter(s => s.status === 'running' && (!s.port || s.portOpen)).length} of {miniPanelServices.length} active</span>
            <button className="svc-refresh-btn" onClick={() => fetchStatus()} title="Refresh now"><RefreshCw size={13} /></button>
          </div>

          {loading ? (
            <div className="svc-loading">Loading services...</div>
          ) : (
            <div className="svc-service-list">
              {miniPanelServices.map(svc => {
                const isOpen = !collapsed.has(svc.id)
                const isPending = actionPending?.startsWith(svc.id)
                const isConfirming = confirmAction?.id === svc.id
                const isRunning = svc.status === 'running'

                return (
                  <div key={svc.id} className={`svc-service-block ${(SERVICE_BRAND[svc.id] || {}).className || ''}`}>
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
                              {svc.uptime && svc.status === 'running' ? ` \u00b7 ${formatUptime(svc.uptime)}` : ''}
                              {svc.port ? ` \u00b7 :${svc.port}` : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="svc-header-info">
                            <span className="svc-header-name">{svc.label}</span>
                            <span className="svc-header-detail">
                              {statusLabel(svc)}
                              {svc.uptime && svc.status === 'running' ? ` \u00b7 ${formatUptime(svc.uptime)}` : ''}
                              {svc.port ? ` \u00b7 :${svc.port}` : ''}
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
          )}
        </div>

        <WatchdogPanel />

        <div className="svc-footer-info">
          Last checked {lastRefresh.toLocaleTimeString()} &middot; Auto-refreshes every 10s
        </div>
      </div>
      )}
    </div>
  )
}
