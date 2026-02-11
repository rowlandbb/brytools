'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowRight, Loader2, Check, X, Trash2, Download,
  Clock, AlertCircle, Film, FileText, AudioLines, List,
  Image, File, ChevronDown, ChevronRight, Copy,
} from 'lucide-react'

// ─── Types ───

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

interface PlaylistPrompt {
  url: string
  mode: string
  count: number
  items: { title: string; channel: string; duration: number }[]
  totalDuration: number
}

interface FileEntry {
  name: string
  size: number
  ext: string
  type: 'video' | 'audio' | 'subtitle' | 'text' | 'image' | 'data'
  isProxy: boolean
}

interface FolderDetail {
  files: FileEntry[]
  previewVideo: string | null
  thumbnail: string | null
}

// ─── Helpers ───

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

function folderFromOutputDir(outputDir: string | null): string | null {
  if (!outputDir) return null
  const parts = outputDir.split('/')
  return parts[parts.length - 1] || null
}

function serveUrl(folder: string, file: string): string {
  return `/api/files/serve?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`
}

function fileIcon(type: FileEntry['type']) {
  switch (type) {
    case 'video': return <Film size={14} strokeWidth={1.5} />
    case 'audio': return <AudioLines size={14} strokeWidth={1.5} />
    case 'subtitle': return <FileText size={14} strokeWidth={1.5} />
    case 'text': return <FileText size={14} strokeWidth={1.5} />
    case 'image': return <Image size={14} strokeWidth={1.5} />
    default: return <File size={14} strokeWidth={1.5} />
  }
}

function fileIconClass(type: FileEntry['type']): string {
  switch (type) {
    case 'video': case 'audio': return 'file-icon file-icon--video'
    case 'subtitle': case 'text': return 'file-icon file-icon--text'
    default: return 'file-icon'
  }
}

const MODE_INFO: Record<string, { label: string; desc: string }> = {
  full: { label: 'Full', desc: 'Video + Proxy + Subs' },
  text: { label: 'Text', desc: 'Subtitles only' },
  wav: { label: 'WAV', desc: '48kHz 16-bit PCM' },
}

// ─── Component ───

export default function DumpPage() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'full' | 'text' | 'wav'>('full')
  const [submitting, setSubmitting] = useState(false)
  const [queue, setQueue] = useState<DumpJob[]>([])
  const [history, setHistory] = useState<DumpJob[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [deletingHistory, setDeletingHistory] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [playlist, setPlaylist] = useState<PlaylistPrompt | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Expanded file browser state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [folderDetail, setFolderDetail] = useState<FolderDetail | null>(null)
  const [folderLoading, setFolderLoading] = useState(false)
  const [textModal, setTextModal] = useState<{ name: string; content: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmFileDelete, setConfirmFileDelete] = useState<{ folder: string; file: string } | null>(null)
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<string | null>(null)
  const [fileDeleting, setFileDeleting] = useState(false)

  // ─── Data fetching ───

  const fetchQueue = useCallback(async () => {
    try {
      const r = await fetch('/api/dump/queue')
      const d = await r.json()
      setQueue(d.queue || [])
    } catch {}
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/dump/history?limit=50')
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

  useEffect(() => { inputRef.current?.focus() }, [])

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textModal) { setTextModal(null); return }
        if (playlist) { setPlaylist(null); return }
        if (confirmFileDelete) { setConfirmFileDelete(null); return }
        if (confirmFolderDelete) { setConfirmFolderDelete(null); return }
        if (expandedId) { setExpandedId(null); setFolderDetail(null); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [textModal, playlist, confirmFileDelete, confirmFolderDelete, expandedId])

  // ─── Submit / playlist logic ───

  const handleSubmit = async () => {
    const trimmed = url.trim()
    if (!trimmed || submitting) return
    if (!trimmed.match(/^https?:\/\//)) { setError('Enter a valid URL'); return }

    setSubmitting(true)
    setError('')

    try {
      const r = await fetch('/api/dump/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, mode, action: 'check' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to check URL')

      if (d.type === 'playlist') {
        setPlaylist({ url: trimmed, mode, count: d.count, items: d.items || [], totalDuration: d.totalDuration || 0 })
        setSubmitting(false)
        return
      }

      await submitDownload(trimmed, mode, false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check URL')
      setSubmitting(false)
    }
  }

  const submitDownload = async (submitUrl: string, submitMode: string, noPlaylist: boolean) => {
    try {
      const r = await fetch('/api/dump/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: submitUrl, mode: submitMode, action: 'submit', noPlaylist }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to submit')
      setUrl('')
      setPlaylist(null)
      fetchQueue()
      inputRef.current?.focus()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePlaylistChoice = (choice: 'single' | 'playlist') => {
    if (!playlist) return
    setSubmitting(true)
    submitDownload(playlist.url, playlist.mode, choice === 'single')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit() }

  const handleCancel = async (id: string) => {
    if (cancelling === id) {
      try {
        await fetch('/api/dump/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
        fetchQueue()
      } catch {}
      setCancelling(null)
    } else {
      setCancelling(id)
      setTimeout(() => setCancelling(c => c === id ? null : c), 4000)
    }
  }

  const handleDeleteHistory = async (id: string) => {
    if (deletingHistory === id) {
      try {
        await fetch('/api/dump/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, deleteFiles: false }) })
        if (expandedId === id) { setExpandedId(null); setFolderDetail(null) }
        fetchHistory()
      } catch {}
      setDeletingHistory(null)
    } else {
      setDeletingHistory(id)
      setTimeout(() => setDeletingHistory(d => d === id ? null : d), 4000)
    }
  }

  // ─── Folder expand/collapse ───

  const toggleExpand = async (job: DumpJob) => {
    if (expandedId === job.id) {
      setExpandedId(null)
      setFolderDetail(null)
      return
    }

    const folder = folderFromOutputDir(job.output_dir)
    if (!folder) return

    setExpandedId(job.id)
    setFolderLoading(true)
    setFolderDetail(null)

    try {
      const r = await fetch(`/api/files/detail?folder=${encodeURIComponent(folder)}`)
      const d = await r.json()
      setFolderDetail({ files: d.files || [], previewVideo: d.previewVideo || null, thumbnail: d.thumbnail || null })
    } catch {
      setFolderDetail({ files: [], previewVideo: null, thumbnail: null })
    }
    setFolderLoading(false)
  }

  // ─── File actions ───

  const openTextPreview = async (folder: string, file: string) => {
    try {
      const r = await fetch(serveUrl(folder, file))
      const text = await r.text()
      setTextModal({ name: file, content: text })
    } catch {
      setTextModal({ name: file, content: 'Failed to load.' })
    }
  }

  const copyText = async () => {
    if (!textModal) return
    try {
      await navigator.clipboard.writeText(textModal.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleDeleteFile = async (folder: string, file: string) => {
    setFileDeleting(true)
    try {
      const r = await fetch('/api/files/detail', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, file }),
      })
      const d = await r.json()
      if (d.folderRemoved) {
        setExpandedId(null)
        setFolderDetail(null)
        fetchHistory()
      } else {
        // Refresh files
        const r2 = await fetch(`/api/files/detail?folder=${encodeURIComponent(folder)}`)
        const d2 = await r2.json()
        setFolderDetail({ files: d2.files || [], previewVideo: d2.previewVideo || null, thumbnail: d2.thumbnail || null })
      }
    } catch {}
    setConfirmFileDelete(null)
    setFileDeleting(false)
  }

  const handleDeleteFolder = async (folder: string) => {
    setFileDeleting(true)
    try {
      await fetch('/api/files/detail', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      setExpandedId(null)
      setFolderDetail(null)
      fetchHistory()
    } catch {}
    setConfirmFolderDelete(null)
    setFileDeleting(false)
  }

  // ─── Render helpers ───

  const activeJobs = queue.filter(j => j.status === 'downloading' || j.status === 'processing')
  const queuedJobs = queue.filter(j => j.status === 'queued')

  const renderExpandedFiles = (job: DumpJob) => {
    const folder = folderFromOutputDir(job.output_dir)
    if (!folder || !folderDetail) return null

    const visibleFiles = folderDetail.files.filter(f => f.name !== 'info.json')

    return (
      <div className="dump-expanded">
        {/* Video preview */}
        {folderDetail.previewVideo && (
          <div className="files-video-preview">
            <video
              controls
              preload="metadata"
              poster={folderDetail.thumbnail ? serveUrl(folder, folderDetail.thumbnail) : undefined}
              src={serveUrl(folder, folderDetail.previewVideo)}
            />
          </div>
        )}

        {/* Meta bar */}
        <div className="files-folder-meta">
          <span className="files-badge">{job.mode}</span>
          {job.channel && <span className="files-meta-item">{job.channel}</span>}
          <span className="files-meta-sep"></span>
          <span className="files-meta-item">{formatBytes(visibleFiles.reduce((s, f) => s + f.size, 0))}</span>
          {job.duration && job.duration > 0 && (
            <><span className="files-meta-sep"></span><span className="files-meta-item">{formatDuration(job.duration)}</span></>
          )}
          <div style={{ flex: 1 }} />
          {confirmFolderDelete === folder ? (
            <div className="confirm-group">
              <button className="btn-confirm-delete" onClick={() => handleDeleteFolder(folder)} disabled={fileDeleting}>
                {fileDeleting ? '...' : 'Delete all'}
              </button>
              <button className="btn-cancel" onClick={() => setConfirmFolderDelete(null)}>Keep</button>
            </div>
          ) : (
            <button className="files-delete-folder-btn" onClick={() => setConfirmFolderDelete(folder)}>
              <Trash2 size={12} strokeWidth={1.5} /> Delete folder
            </button>
          )}
        </div>

        {/* File list */}
        <div className="card">
          {visibleFiles.map(file => {
            const isClickable = file.type === 'text' || file.type === 'subtitle'
            return (
              <div
                key={file.name}
                className={`file-row${isClickable ? ' file-row--clickable' : ''}`}
                onClick={isClickable ? () => openTextPreview(folder, file.name) : undefined}
              >
                <div className={fileIconClass(file.type)}>{fileIcon(file.type)}</div>
                <div className="file-info"><span className="file-name">{file.name}</span></div>
                <span className="file-ext">{file.isProxy ? 'proxy' : file.ext}</span>
                <span className="file-size">{formatBytes(file.size)}</span>
                <div className="file-actions">
                  {isClickable && (
                    <button className="files-btn-sm" onClick={e => { e.stopPropagation(); openTextPreview(folder, file.name) }}>View</button>
                  )}
                  {confirmFileDelete?.folder === folder && confirmFileDelete?.file === file.name ? (
                    <div className="confirm-group" onClick={e => e.stopPropagation()}>
                      <button className="btn-confirm-delete" onClick={() => handleDeleteFile(folder, file.name)} disabled={fileDeleting}>
                        {fileDeleting ? '...' : 'Delete'}
                      </button>
                      <button className="btn-cancel" onClick={() => setConfirmFileDelete(null)}>Keep</button>
                    </div>
                  ) : (
                    <button
                      className="files-btn-sm files-btn-sm--danger"
                      onClick={e => { e.stopPropagation(); setConfirmFileDelete({ folder, file: file.name }) }}
                    >
                      <X size={11} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Render ───

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
            disabled={submitting}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="dump-go-btn" onClick={handleSubmit} disabled={submitting || !url.trim()}>
            {submitting ? <Loader2 size={16} strokeWidth={1.5} className="processing-icon" /> : <ArrowRight size={16} strokeWidth={1.5} />}
          </button>
        </div>
        {error && <div className="dump-error">{error}</div>}

        <div className="model-options dump-mode-options">
          {(['full', 'text', 'wav'] as const).map(m => {
            const info = MODE_INFO[m]
            return (
              <button key={m} className={`model-option${mode === m ? ' model-option--active' : ''}`} onClick={() => setMode(m)}>
                <span className="model-option-name">{info.label}</span>
                <span className="model-option-desc">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Playlist Confirmation */}
      {playlist && (
        <div className="preview-overlay" onClick={() => setPlaylist(null)}>
          <div className="preview-panel playlist-panel" onClick={e => e.stopPropagation()}>
            <div className="preview-header">
              <div className="preview-title-group">
                <div className="preview-title-icon"><List size={15} strokeWidth={1.5} /></div>
                <span className="preview-title">Playlist detected</span>
              </div>
              <button className="preview-close" onClick={() => setPlaylist(null)}><X size={16} strokeWidth={1.5} /></button>
            </div>
            <div className="preview-body">
              <div className="playlist-info">
                <span className="playlist-count">{playlist.count} videos</span>
                {playlist.totalDuration > 0 && <span className="playlist-duration">{formatDuration(playlist.totalDuration)} total</span>}
              </div>
              <div className="playlist-preview">
                {playlist.items.map((item, i) => (
                  <div key={i} className="playlist-item">
                    <span className="playlist-item-num">{i + 1}</span>
                    <span className="playlist-item-title">{item.title}</span>
                    {item.duration > 0 && <span className="playlist-item-dur">{formatDuration(item.duration)}</span>}
                  </div>
                ))}
                {playlist.count > playlist.items.length && (
                  <div className="playlist-item playlist-item-more">...and {playlist.count - playlist.items.length} more</div>
                )}
              </div>
              <div className="playlist-actions">
                <button className="playlist-btn playlist-btn-single" onClick={() => handlePlaylistChoice('single')}>Just this video</button>
                <button className="playlist-btn playlist-btn-all" onClick={() => handlePlaylistChoice('playlist')}>Download all {playlist.count}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div className="section">
          <div className="section-label">Queue <span className="section-count">{queue.length}</span></div>
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
                        <div className="processing-progress-fill" style={{ width: `${job.progress_percent || 0}%` }} />
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
                    <button className="btn-cancel-job" onClick={() => handleCancel(job.id)}><X size={11} strokeWidth={1.5} /> Cancel</button>
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
                    <span className="row-detail">Waiting...{job.channel && <> · {job.channel}</>}
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
                    <button className="btn-icon" onClick={() => handleCancel(job.id)}><X size={14} strokeWidth={1.5} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed - with expandable file browser */}
      {history.length > 0 && (
        <div className="section">
          <div className="section-label">Completed <span className="section-count">{historyTotal}</span></div>
          <div className="card">
            {history.map(job => {
              const isExpanded = expandedId === job.id
              const hasFolder = !!job.output_dir && job.status === 'completed'

              return (
                <div key={job.id}>
                  <div
                    className={`row row--hoverable${hasFolder ? ' row--clickable' : ''}${isExpanded ? ' row--expanded' : ''}`}
                    onClick={hasFolder ? () => toggleExpand(job) : undefined}
                  >
                    <div className="row-info">
                      <div className="row-icon">
                        {job.status === 'completed' ? (
                          hasFolder ? (
                            isExpanded ? <ChevronDown size={15} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                                      : <ChevronRight size={15} strokeWidth={1.5} style={{ color: 'var(--text-dim)' }} />
                          ) : (
                            <Check size={15} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                          )
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
                    <div className="row-actions" onClick={e => e.stopPropagation()}>
                      {deletingHistory === job.id ? (
                        <div className="confirm-group">
                          <button className="btn-confirm-delete" onClick={() => handleDeleteHistory(job.id)}>Delete</button>
                          <button className="btn-cancel" onClick={() => setDeletingHistory(null)}>Keep</button>
                        </div>
                      ) : (
                        <button className="btn-icon btn-delete" onClick={() => handleDeleteHistory(job.id)}>
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded file browser */}
                  {isExpanded && (
                    folderLoading ? (
                      <div className="dump-expanded"><div className="files-loading">Loading files...</div></div>
                    ) : folderDetail ? (
                      renderExpandedFiles(job)
                    ) : null
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {queue.length === 0 && history.length === 0 && (
        <div className="empty-state">
          <Download size={28} strokeWidth={0.8} />
          <p>Paste a URL above to get started</p>
          <p className="empty-hint">YouTube, Twitter, and most video platforms supported</p>
        </div>
      )}

      {/* Text Preview Modal */}
      {textModal && (
        <div className="preview-overlay" onClick={() => setTextModal(null)}>
          <div className="preview-panel files-text-modal" onClick={e => e.stopPropagation()}>
            <div className="preview-header">
              <div className="preview-title-group">
                <div className="preview-title-icon"><FileText size={15} strokeWidth={1.5} /></div>
                <span className="preview-title">{textModal.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button className="files-btn-sm" onClick={copyText}>
                  {copied ? <><Check size={11} strokeWidth={1.5} /> Copied</> : <><Copy size={11} strokeWidth={1.5} /> Copy</>}
                </button>
                <button className="preview-close" onClick={() => setTextModal(null)}><X size={16} strokeWidth={1.5} /></button>
              </div>
            </div>
            <div className="files-text-body"><pre>{textModal.content}</pre></div>
          </div>
        </div>
      )}
    </div>
  )
}
