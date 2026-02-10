'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload, FileText, Download, Loader2, Check, Trash2, Film, Music,
  X, Copy, CheckCheck, HardDrive, ChevronDown, ChevronUp, Play,
} from 'lucide-react'

interface TranscriptFile { name: string; size: number; uploadedAt: string; status: 'ready' | 'processing' | 'completed'; transcriptPath?: string }
interface UploadProgress { filename: string; progress: number; status: 'uploading' | 'done' | 'error' }
interface PreviewState { open: boolean; filename: string; content: string; loading: boolean }
interface ProgressInfo { status: 'loading_model' | 'transcribing' | 'complete' | 'error'; percent: number | null; elapsed: number; eta: number | null; model: string; duration: number | null; fileSize: number; segments: number; currentTime: number; error?: string }
interface DoneFile { name: string; size: number; modifiedAt: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'avi']
function isVideo(name: string) { return VIDEO_EXT.includes(name.split('.').pop()?.toLowerCase() || '') }
function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return ''
  if (seconds < 60) return `~${Math.round(seconds)}s left`
  if (seconds < 3600) { const m = Math.floor(seconds / 60); const s = Math.round(seconds % 60); return `~${m}m ${s}s left` }
  const h = Math.floor(seconds / 3600); const m = Math.round((seconds % 3600) / 60); return `~${h}h ${m}m left`
}
function formatElapsed(seconds: number): string {
  if (!seconds) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) { const m = Math.floor(seconds / 60); const s = Math.round(seconds % 60); return `${m}m ${s}s` }
  const h = Math.floor(seconds / 3600); const m = Math.round((seconds % 3600) / 60); return `${h}h ${m}m`
}

export default function TranscribePage() {
  const [files, setFiles] = useState<TranscriptFile[]>([])
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [startModel, setStartModel] = useState<string>('quality')
  const [preview, setPreview] = useState<PreviewState>({ open: false, filename: '', content: '', loading: false })
  const [copied, setCopied] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  const [doneFiles, setDoneFiles] = useState<DoneFile[]>([])
  const [doneTotal, setDoneTotal] = useState(0)
  const [deletingDone, setDeletingDone] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [progress, setProgress] = useState<Record<string, ProgressInfo>>({})
  const [cancelling, setCancelling] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchFiles(); fetchProgress(); const id = setInterval(() => { fetchFiles(); fetchProgress() }, 5000); return () => clearInterval(id) }, [])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(p => ({ ...p, open: false })) }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  useEffect(() => { document.body.style.overflow = preview.open ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [preview.open])

  const fetchFiles = async () => { try { const r = await fetch('/api/transcribe/files'); const d = await r.json(); setFiles(d.files || []) } catch {} }
  const fetchProgress = async () => { try { const r = await fetch('/api/transcribe/progress'); const d = await r.json(); setProgress(d.progress || {}) } catch {} }

  const openPreview = async (file: TranscriptFile) => {
    const transcriptFile = file.transcriptPath || file.name
    setPreview({ open: true, filename: file.name, content: '', loading: true }); setCopied(false)
    try { const r = await fetch(`/api/transcribe/preview?file=${encodeURIComponent(transcriptFile)}`); if (!r.ok) throw new Error(); const d = await r.json(); setPreview(p => ({ ...p, content: d.content, loading: false }))
    } catch { try { const r = await fetch(`/api/transcribe/download?file=${encodeURIComponent(transcriptFile)}`); const text = await r.text(); setPreview(p => ({ ...p, content: text, loading: false })) } catch { setPreview(p => ({ ...p, content: 'Failed to load transcript.', loading: false })) } }
  }
  const copyTranscript = async () => { try { await navigator.clipboard.writeText(preview.content); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }

  const uploadFile = useCallback(async (file: File) => {
    setUploads(p => [...p, { filename: file.name, progress: 0, status: 'uploading' }])
    const fd = new FormData(); fd.append('file', file)
    try {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) { const pct = Math.round((e.loaded / e.total) * 100); setUploads(p => p.map(u => u.filename === file.name ? { ...u, progress: pct } : u)) } })
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { setUploads(p => p.map(u => u.filename === file.name ? { ...u, progress: 100, status: 'done' } : u)); resolve() } else { setUploads(p => p.map(u => u.filename === file.name ? { ...u, status: 'error' } : u)); reject() } }
        xhr.onerror = () => { setUploads(p => p.map(u => u.filename === file.name ? { ...u, status: 'error' } : u)); reject() }
        xhr.open('POST', '/api/transcribe/upload'); xhr.send(fd)
      })
      setTimeout(() => setUploads(p => p.filter(u => u.filename !== file.name)), 2000); fetchFiles()
    } catch {}
  }, [])

  const handleFiles = useCallback((list: File[]) => list.forEach(f => uploadFile(f)), [uploadFile])
  const onDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type === 'dragenter' || e.type === 'dragover') }
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); handleFiles(Array.from(e.dataTransfer.files)) }
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) { handleFiles(Array.from(e.target.files)); e.target.value = '' } }
  const download = (path: string) => window.open(`/api/transcribe/download?file=${encodeURIComponent(path)}`, '_blank')
  const remove = async (file: TranscriptFile) => { const target = file.transcriptPath || file.name; try { await fetch(`/api/transcribe/delete?file=${encodeURIComponent(target)}`, { method: 'DELETE' }); setDeleting(null); fetchFiles() } catch {} }
  const fetchStorage = async () => { try { const r = await fetch('/api/transcribe/storage'); const d = await r.json(); setDoneFiles(d.files || []); setDoneTotal(d.totalSize || 0) } catch {} }
  const deleteDoneFile = async (name: string) => { try { await fetch(`/api/transcribe/storage?file=${encodeURIComponent(name)}`, { method: 'DELETE' }); setDeletingDone(null); fetchStorage() } catch {} }
  const deleteAllDone = async () => { for (const f of doneFiles) { try { await fetch(`/api/transcribe/storage?file=${encodeURIComponent(f.name)}`, { method: 'DELETE' }) } catch {} }; setDeletingAll(false); fetchStorage() }
  useEffect(() => { if (storageOpen) fetchStorage() }, [storageOpen])
  const cancelJob = async (filename: string) => { try { await fetch('/api/transcribe/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) }); setCancelling(null); fetchFiles(); fetchProgress() } catch {} }
  const startJobs = async (filenames: string[]) => { try { await fetch('/api/transcribe/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames, model: startModel }) }); fetchFiles() } catch {} }

  const ready = files.filter(f => f.status === 'ready')
  const processing = files.filter(f => f.status === 'processing')
  const completed = files.filter(f => f.status === 'completed')

  return (
    <>
      {/* Upload */}
      <div className={`drop-zone ${dragActive ? 'drop-zone--active' : ''}`} onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
        <div className="drop-zone-content">
          <div className="drop-icon"><Upload strokeWidth={1.2} /></div>
          <p className="drop-title">{dragActive ? 'Drop to upload' : 'Upload media'}</p>
          <p className="drop-subtitle">MP4, MOV, MP3, WAV, M4A, MKV, AVI</p>
          <button className="browse-btn" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>Choose files</button>
        </div>
        <input ref={inputRef} type="file" multiple accept=".mp4,.mov,.mp3,.wav,.m4a,.mkv,.avi" onChange={onInput} hidden />
      </div>

      {/* Ready */}
      {ready.length > 0 && (
        <section className="section fade-in">
          <div className="section-label">Ready <span className="section-count">{ready.length}</span></div>
          <div className="ready-controls">
            <div className="model-options">
              {[{ id: 'turbo', name: 'Turbo', desc: 'tiny' }, { id: 'fast', name: 'Fast', desc: 'base' }, { id: 'balanced', name: 'Balanced', desc: 'medium' }, { id: 'quality', name: 'Quality', desc: 'large-v3' }].map(m => (
                <button key={m.id} className={`model-option ${startModel === m.id ? 'model-option--active' : ''}`} onClick={() => setStartModel(m.id)}>
                  <span className="model-option-name">{m.name}</span>
                  <span className="model-option-desc">{m.desc}</span>
                </button>
              ))}
            </div>
            <button className="btn-start-all" onClick={() => startJobs(ready.map(f => f.name))}><Play size={13} strokeWidth={1.5} /> Start {ready.length > 1 ? `all ${ready.length}` : ''}</button>
          </div>
          <div className="card">
            {ready.map((f, i) => (
              <div key={f.name + i} className="row row--hoverable fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="row-info">
                  <div className="row-icon">{isVideo(f.name) ? <Film size={14} strokeWidth={1.2} /> : <Music size={14} strokeWidth={1.2} />}</div>
                  <div className="row-text"><span className="row-name">{f.name}</span><span className="row-detail">{formatBytes(f.size)}</span></div>
                </div>
                <div className="row-actions">
                  <button className="btn-start-single" onClick={() => startJobs([f.name])} title="Start transcription"><Play size={12} strokeWidth={1.5} /></button>
                  <button className="btn-icon btn-delete" onClick={() => setCancelling(f.name)} title="Remove"><Trash2 size={13} strokeWidth={1.3} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Uploads */}
      {uploads.length > 0 && (
        <section className="section fade-in">
          <div className="section-label">Uploading</div>
          <div className="card">
            {uploads.map(u => (
              <div key={u.filename} className="row">
                <div className="row-info"><div className="row-text"><span className="row-name">{u.filename}</span><div className="progress-track"><div className="progress-fill" style={{ width: `${u.progress}%` }} /><div className="progress-glow" /></div></div></div>
                <span className="row-meta">{u.status === 'error' ? <span className="text-red">failed</span> : u.status === 'done' ? <Check size={14} className="text-green" /> : `${u.progress}%`}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Processing */}
      {processing.length > 0 && (
        <section className="section fade-in">
          <div className="section-label">Processing <span className="section-count">{processing.length}</span></div>
          <div className="card">
            {processing.map((f, i) => {
              const p = progress[f.name]; const hasProgress = p && (p.status === 'transcribing' || p.status === 'loading_model'); const pct = p?.percent ?? null
              return (
                <div key={f.name + i} className="row row--processing">
                  <div className="row-info">
                    <div className="row-icon processing-icon"><Loader2 size={14} strokeWidth={1.5} /></div>
                    <div className="row-text">
                      <span className="row-name">{f.name}</span>
                      {hasProgress ? (
                        <div className="processing-detail">
                          <div className="processing-progress-track"><div className="processing-progress-fill" style={{ width: pct !== null ? `${pct}%` : '0%' }} /></div>
                          <span className="processing-stats">
                            {p.status === 'loading_model' ? 'Loading model...' : pct !== null ? (<><span className="processing-pct">{pct}%</span><span className="processing-sep">&middot;</span>{formatElapsed(p.elapsed)}{p.eta !== null && (<><span className="processing-sep">&middot;</span><span className="processing-eta">{formatEta(p.eta)}</span></>)}</>) : (<>{formatElapsed(p.elapsed)}<span className="processing-sep">&middot;</span>{p.segments} segments</>)}
                          </span>
                        </div>
                      ) : (<span className="row-detail">{formatBytes(f.size)} &middot; queued</span>)}
                    </div>
                  </div>
                  <div className="row-actions">
                    {cancelling === f.name ? (
                      <div className="confirm-group"><button className="btn-confirm-delete" onClick={() => cancelJob(f.name)}>Cancel job</button><button className="btn-cancel" onClick={() => setCancelling(null)}>Keep</button></div>
                    ) : (<>{hasProgress && p.model && <span className="row-badge">{p.model}</span>}<button className="btn-cancel-job" onClick={() => setCancelling(f.name)}><X size={11} strokeWidth={1.5} />Cancel</button></>)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Completed */}
      <section className="section">
        <div className="section-label">Completed <span className="section-count">{completed.length}</span></div>
        {completed.length === 0 ? (
          <div className="empty-state"><FileText size={28} strokeWidth={0.8} /><p>No transcripts yet</p><p className="empty-hint">Upload a file to get started</p></div>
        ) : (
          <div className="card">
            {completed.map((f, i) => (
              <div key={(f.transcriptPath || f.name) + i} className="row row--hoverable row--clickable fade-in" style={{ animationDelay: `${i * 40}ms` }} onClick={() => openPreview(f)}>
                <div className="row-info">
                  <div className="row-icon">{isVideo(f.name) ? <Film size={14} strokeWidth={1.2} /> : <Music size={14} strokeWidth={1.2} />}</div>
                  <div className="row-text"><span className="row-name">{f.name}</span><span className="row-detail">{timeAgo(f.uploadedAt)}</span></div>
                </div>
                <div className="row-actions">
                  {deleting === f.name ? (
                    <div className="confirm-group" onClick={e => e.stopPropagation()}><button className="btn-confirm-delete" onClick={() => remove(f)}>Delete</button><button className="btn-cancel" onClick={() => setDeleting(null)}>Cancel</button></div>
                  ) : (<><button className="btn-icon btn-delete" onClick={(e) => { e.stopPropagation(); setDeleting(f.name) }} title="Delete"><Trash2 size={13} strokeWidth={1.3} /></button><button className="btn-download" onClick={(e) => { e.stopPropagation(); download(f.transcriptPath || f.name) }}><Download size={13} strokeWidth={1.3} /><span>Download</span></button></>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Storage */}
      <section className="section storage-section">
        <button className="storage-toggle" onClick={() => setStorageOpen(!storageOpen)}>
          <div className="storage-toggle-left"><HardDrive size={13} strokeWidth={1.3} /><span>Source Files</span>{doneTotal > 0 && !storageOpen && <span className="storage-size-badge">{formatBytes(doneTotal)}</span>}</div>
          {storageOpen ? <ChevronUp size={14} strokeWidth={1.3} /> : <ChevronDown size={14} strokeWidth={1.3} />}
        </button>
        {storageOpen && (
          <div className="fade-in">
            {doneFiles.length === 0 ? <div className="storage-empty">No source files in Done folder</div> : (
              <>
                <div className="storage-summary">
                  <span>{doneFiles.length} file{doneFiles.length !== 1 ? 's' : ''} using {formatBytes(doneTotal)}</span>
                  {deletingAll ? (<div className="confirm-group"><button className="btn-confirm-delete" onClick={deleteAllDone}>Delete all {doneFiles.length} files</button><button className="btn-cancel" onClick={() => setDeletingAll(false)}>Cancel</button></div>) : (<button className="storage-delete-all" onClick={() => setDeletingAll(true)}>Delete all</button>)}
                </div>
                <div className="card">
                  {doneFiles.map((f, i) => (
                    <div key={f.name + i} className="row row--hoverable fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                      <div className="row-info">
                        <div className="row-icon">{isVideo(f.name) ? <Film size={14} strokeWidth={1.2} /> : <Music size={14} strokeWidth={1.2} />}</div>
                        <div className="row-text"><span className="row-name">{f.name}</span><span className="row-detail">{formatBytes(f.size)}<span className="storage-size-highlight">{f.size > 1073741824 ? ' \u2014 large file' : ''}</span></span></div>
                      </div>
                      <div className="row-actions">
                        {deletingDone === f.name ? (<div className="confirm-group" onClick={e => e.stopPropagation()}><button className="btn-confirm-delete" onClick={() => deleteDoneFile(f.name)}>Delete</button><button className="btn-cancel" onClick={() => setDeletingDone(null)}>Cancel</button></div>) : (<button className="btn-icon" onClick={() => setDeletingDone(f.name)} title="Delete source file"><Trash2 size={13} strokeWidth={1.3} /></button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Preview Modal */}
      {preview.open && (
        <div className="preview-overlay" onClick={() => setPreview(p => ({ ...p, open: false }))}>
          <div ref={previewRef} className="preview-panel" onClick={e => e.stopPropagation()}>
            <div className="preview-header">
              <div className="preview-title-group"><FileText size={14} strokeWidth={1.2} className="preview-title-icon" /><h2 className="preview-title">{preview.filename}</h2></div>
              <div className="preview-actions">
                <button className="preview-btn" onClick={copyTranscript} title="Copy to clipboard">{copied ? <><CheckCheck size={13} strokeWidth={1.3} /> <span>Copied</span></> : <><Copy size={13} strokeWidth={1.3} /> <span>Copy</span></>}</button>
                <button className="preview-btn" onClick={() => download(files.find(f => f.name === preview.filename)?.transcriptPath || preview.filename)} title="Download"><Download size={13} strokeWidth={1.3} /><span>Download</span></button>
                <button className="preview-close" onClick={() => setPreview(p => ({ ...p, open: false }))}><X size={16} strokeWidth={1.5} /></button>
              </div>
            </div>
            <div className="preview-body">
              {preview.loading ? (<div className="preview-loading"><Loader2 size={20} strokeWidth={1.2} className="preview-spinner" /><span>Loading transcript...</span></div>) : (<pre className="preview-content">{preview.content}</pre>)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
