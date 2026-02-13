'use client'

import { useState, useEffect } from 'react'
import { Activity, Zap, Globe, ArrowDown, ArrowUp } from 'lucide-react'

interface HeartbeatSample { ts: number; down: number; up: number }
interface HeartbeatData {
  samples: HeartbeatSample[]
  current: { down: number; up: number; downFmt: string; upFmt: string } | null
}

export default function Heartbeat() {
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

  const allRates = samples.flatMap(s => [s.down, s.up])
  const maxRate = Math.max(1024, ...allRates) * 1.2

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
          <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4 4" />
          {isAlive && (
            <>
              <path d={downArea} fill="var(--accent)" opacity="0.08" />
              <path d={downPath} fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.7" />
              <path d={upArea} fill="var(--green)" opacity="0.06" />
              <path d={upPath} fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.6" />
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
