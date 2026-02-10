'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowRight, Loader2, Check, X, Trash2, Download,
  Clock, AlertCircle, Film, FileText, AudioLines,
} from 'lucide-react'

interface DumpJob {
  id: string
  url: string
  title: string | null
  channel: string | null
  duration: number | null
  mode: string
  status: string
  progress_percent: number
  speed: string | null
  eta: string | null
  error: string | null
  file_size: number | null
  output_dir: string | null
  created_at: string
  completed_at: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) { const m = Math.floor(seconds / 60); const s = seconds % 60; return s > 0 ? `${m}m ${s}s` : `${m}m` }
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return `${h}h ${m}m`
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const MODE_INFO: Record<string, { label: string; desc: string; icon: typeof Film }> = {
  full: { label: 'Full', desc: 'Video + Proxy + Subs', icon: Film },
  text: { label: 'Text', desc: 'Subtitles only', icon: FileText },
  wav: { label: 'WAV', desc: '48kHz 16-bit PCM', icon: AudioLines },
}

export default function DumpPage() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'full' | 'text' | 'wav'>('full')
  const [submitting, setSubmitting] = useState(false)
  const [queue, setQueue] = useState<DumpJob[]>([])
  const [history, setHistory] = useState<DumpJob[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchQueue = useCallback(async () => {
    try {
      const r = await fetch('/api/dump/queue')
      const d = await r.json()
      setQueue(d.queue || [])
    } catch {}
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/dump/history?limit=30')
      const d = await r.json()
      setHistory(d.history || [])
      setHistoryTotal(d.total || 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchQueue()
    fetchHistory()
    const id = setInterval(() => { fetchQueue(); fetchHistory() }, 2000)
    return () => clearInterval(id)
  }, [fetchQueue, fetchHistory])

  // Auto-focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async () => {
    const trimmed = url.trim()
    if (!trimmed || submitting) return

    // Basic URL validation
    if (!trimmed.match(/^https?:\/\//)) {
      setError('Enter a valid URL')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const r = await fetch('/api/dump/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, mode }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to submit')
      setUrl('')
      fetchQueue()
      inputRef.current?.focus()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').trim()
    if (text.match(/^https?:\/\//)) {
      e.preventDefault()
      setUrl(text)
      // Auto-submit after a tick
      setTimeout(() => {
        setSubmitting(true)
        setError('')
        fetch('/api/dump/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: text, mode }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.error) throw new Error(d.error)
            setUrl('')
            fetchQueue()
            inputRef.current?.focus()
          })
          .catch(err => setError(err.message))
          .finally(() => setSubmitting(false))
      }, 50)
    }
  }

  const handleCancel = async (id: string) => {
    if (cancelling === id) {
      // Confirmed
      try {
        await fetch('/api/dump/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        fetchQueue()
      } catch {}
      setCancelling(null)
    } else {
      setCancelling(id)
      setTimeout(() => setCancelling(c => c === id ? null : c), 4000)
    }
  }

  const handleDelete = async (id: string) => {
    if (deleting === id) {
      try {
        await fetch('/api/dump/history', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, deleteFiles: false }),
        })
        fetchHistory()
      } catch {}
      setDeleting(null)
    } else {
      setDeleting(id)
      setTimeout(() => setDeleting(d => d === id ? null : d), 4000)
    }
  }

  const activeJobs = queue.filter(j => j.status === 'downloading' || j.status === 'processing')
  const queuedJobs = queue.filter(j => j.status === 'queued')

  return (
    <div className="main">
      {/* URL Input */}
      <div className="dump-input-section">
        <div className="dump-input-row">
          <input
            ref={inputRef}
            type="text"
            className="dump-url-input"
            placeholder="Paste URL..."
            value={url}
            onChange={e => { setUrl(e.target.value); setError('') }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={submitting}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="dump-go-btn"
            onClick={handleSubmit}
            disabled={submitting || !url.trim()}
          >
            {submitting ? <Loader2 size={16} strokeWidth={1.5} className="processing-icon" /> : <ArrowRight size={16} strokeWidth={1.5} />}
          </button>
        </div>
        {error && <div className="dump-error">{error}</div>}

        {/* Mode Selector */}
        <div className="model-options dump-mode-options">
          {(['full', 'text', 'wav'] as const).map(m => {
            const info = MODE_INFO[m]
            return (
              <button
                key={m}
                className={`model-option${mode === m ? ' model-option--active' : ''}`}
                onClick={() => setMode(m)}
              >
                <span className="model-option-name">{info.label}</span>
                <span className="model-option-desc">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="section">
          <div className="section-label">
            Queue
            <span className="section-count">{queue.length}</span>
          </div>
          <div className="card">
            {activeJobs.map(job => (
              <div key={job.id} className="row row--processing">
                <div className="row-info">
                  <div className="row-icon processing-icon">
                    {job.status === 'processing' ? <Loader2 size={16} strokeWidth={1.5} /> : <Download size={16} strokeWidth={1.5} />}
                  </div>
                  <div className="row-text">
                    <span className="row-name">{job.title || 'Downloading...'}</span>
                    <div className="processing-detail">
                      <div className="processing-progress-track">
                        <div
                          className="processing-progress-fill"
                          style={{ width: `${job.progress_percent || 0}%` }}
                        />
                      </div>
                      <div className="processing-stats">
                        {job.status === 'processing' ? (
                          <span className="processing-pct">Post-processing...</span>
                        ) : (
                          <>
                            <span className="processing-pct">{Math.round(job.progress_percent || 0)}%</span>
                            {job.speed && <><span className="processing-sep">·</span><span>{job.speed}</span></>}
                            {job.eta && <><span className="processing-sep">·</span><span className="processing-eta">ETA {job.eta}</span></>}
                          </>
                        )}
                        {job.channel && <><span className="processing-sep">·</span><span>{job.channel}</span></>}
                        <span className="processing-sep">·</span>
                        <span className="row-badge" style={{ display: 'inline', padding: '1px 6px', fontSize: '9px' }}>{job.mode}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="row-actions">
                  {cancelling === job.id ? (
                    <div className="confirm-group">
                      <button className="btn-confirm-delete" onClick={() => handleCancel(job.id)}>Cancel</button>
                      <button className="btn-cancel" onClick={() => setCancelling(null)}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn-cancel-job" onClick={() => handleCancel(job.id)}>
                      <X size={11} strokeWidth={1.5} /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}

            {queuedJobs.map(job => (
              <div key={job.id} className="row">
                <div className="row-info">
                  <div className="row-icon"><Clock size={15} strokeWidth={1.2} /></div>
                  <div className="row-text">
                    <span className="row-name">{job.title || 'Queued...'}</span>
                    <span className="row-detail">
                      Waiting...
                      {job.channel && <> · {job.channel}</>}
                      <span className="processing-sep">·</span>
                      <span className="row-badge" style={{ display: 'inline', padding: '1px 6px', fontSize: '9px' }}>{job.mode}</span>
                    </span>
                  </div>
                </div>
                <div className="row-actions">
                  {cancelling === job.id ? (
                    <div className="confirm-group">
                      <button className="btn-confirm-delete" onClick={() => handleCancel(job.id)}>Remove</button>
                      <button className="btn-cancel" onClick={() => setCancelling(null)}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn-icon" onClick={() => handleCancel(job.id)}>
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {history.length > 0 && (
        <div className="section">
          <div className="section-label">
            Completed
            <span className="section-count">{historyTotal}</span>
          </div>
          <div className="card">
            {history.map(job => (
              <div key={job.id} className="row row--hoverable">
                <div className="row-info">
                  <div className="row-icon">
                    {job.status === 'completed' ? (
                      <Check size={15} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                    ) : job.status === 'error' ? (
                      <AlertCircle size={15} strokeWidth={1.5} style={{ color: 'var(--red)' }} />
                    ) : (
                      <X size={15} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  <div className="row-text">
                    <span className="row-name">{job.title || job.url}</span>
                    <span className="row-detail">
                      {job.channel && <>{job.channel}<span className="processing-sep">·</span></>}
                      <span className="row-badge" style={{ display: 'inline', padding: '1px 6px', fontSize: '9px' }}>{job.mode}</span>
                      {job.file_size ? <><span className="processing-sep">·</span>{formatBytes(job.file_size)}</> : null}
                      {job.error ? <><span className="processing-sep">·</span><span style={{ color: 'var(--red)' }}>{job.error}</span></> : null}
                      <span className="processing-sep">·</span>
                      {timeAgo(job.completed_at)}
                    </span>
                  </div>
                </div>
                <div className="row-actions">
                  {deleting === job.id ? (
                    <div className="confirm-group">
                      <button className="btn-confirm-delete" onClick={() => handleDelete(job.id)}>Delete</button>
                      <button className="btn-cancel" onClick={() => setDeleting(null)}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn-icon btn-delete" onClick={() => handleDelete(job.id)}>
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when nothing at all */}
      {queue.length === 0 && history.length === 0 && (
        <div className="empty-state">
          <Download size={28} strokeWidth={0.8} />
          <p>Paste a URL above to get started</p>
          <p className="empty-hint">YouTube, Twitter, and most video platforms supported</p>
        </div>
      )}
    </div>
  )
}
