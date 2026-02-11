'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Film, FileText, AudioLines, Image, File, Play,
  Trash2, X, ChevronLeft, Copy, Check, AlertCircle, HardDrive,
} from 'lucide-react'

// ─── Types ───

interface FolderEntry {
  name: string
  path: string
  title: string
  channel: string
  mode: string
  fileCount: number
  totalSize: number
  thumbnailFile: string | null
  modifiedAt: number
  duration: number
  videoId: string | null
}

interface FileEntry {
  name: string
  size: number
  ext: string
  type: 'video' | 'audio' | 'subtitle' | 'text' | 'image' | 'data'
  isProxy: boolean
}

// ─── Helpers ───

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) { const m = Math.floor(seconds / 60); const s = seconds % 60; return s > 0 ? `${m}m ${s}s` : `${m}m` }
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return `${h}h ${m}m`
}

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function serveUrl(folder: string, file: string): string {
  return `/api/files/serve?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`
}

function fileIcon(type: FileEntry['type'], isProxy: boolean) {
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
    case 'video': return 'file-icon file-icon--video'
    case 'audio': return 'file-icon file-icon--video'
    case 'subtitle': return 'file-icon file-icon--text'
    case 'text': return 'file-icon file-icon--text'
    default: return 'file-icon'
  }
}

function fileLabel(entry: FileEntry): string {
  if (entry.isProxy) return 'proxy'
  if (entry.type === 'video') return entry.ext
  if (entry.type === 'audio') return entry.ext
  return entry.ext
}

// ─── Component ───

export default function FilesPage() {
  // State
  const [folders, setFolders] = useState<FolderEntry[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [totalFolders, setTotalFolders] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Detail view
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [activeFolderTitle, setActiveFolderTitle] = useState('')
  const [activeFolderInfo, setActiveFolderInfo] = useState<Record<string, unknown>>({})
  const [files, setFiles] = useState<FileEntry[]>([])
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Text preview modal
  const [textModal, setTextModal] = useState<{ name: string; content: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ folder: string; file?: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // ─── Fetch folders ───

  const fetchFolders = useCallback(async (q: string = '') => {
    try {
      const r = await fetch(`/api/files/list${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      const d = await r.json()
      setFolders(d.folders || [])
      setTotalSize(d.totalSize || 0)
      setTotalFolders(d.totalFolders || 0)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  const handleSearch = (val: string) => {
    setSearch(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => fetchFolders(val), 300)
  }

  // ─── Fetch folder detail ───

  const openFolder = async (folder: FolderEntry) => {
    setActiveFolder(folder.name)
    setActiveFolderTitle(folder.title)
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/files/detail?folder=${encodeURIComponent(folder.name)}`)
      const d = await r.json()
      setFiles(d.files || [])
      setPreviewVideo(d.previewVideo || null)
      setThumbnail(d.thumbnail || null)
      setActiveFolderInfo(d.info || {})
    } catch {}
    setDetailLoading(false)
  }

  const closeFolder = () => {
    setActiveFolder(null)
    setFiles([])
    setPreviewVideo(null)
    setThumbnail(null)
    setTextModal(null)
  }

  // ─── Text preview ───

  const openTextPreview = async (folder: string, file: string) => {
    try {
      const r = await fetch(serveUrl(folder, file))
      const text = await r.text()
      setTextModal({ name: file, content: text })
    } catch {
      setTextModal({ name: file, content: 'Failed to load file content.' })
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

  // ─── Delete ───

  const handleDeleteFile = async (folder: string, file: string) => {
    setDeleting(true)
    try {
      const r = await fetch('/api/files/detail', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, file }),
      })
      const d = await r.json()
      if (d.folderRemoved) {
        closeFolder()
        fetchFolders(search)
      } else {
        // Refresh file list
        const r2 = await fetch(`/api/files/detail?folder=${encodeURIComponent(folder)}`)
        const d2 = await r2.json()
        setFiles(d2.files || [])
        setPreviewVideo(d2.previewVideo || null)
        setThumbnail(d2.thumbnail || null)
      }
    } catch {}
    setConfirmDelete(null)
    setDeleting(false)
  }

  const handleDeleteFolder = async (folder: string) => {
    setDeleting(true)
    try {
      await fetch('/api/files/detail', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      closeFolder()
      fetchFolders(search)
    } catch {}
    setConfirmDelete(null)
    setDeleting(false)
  }

  const handleFileClick = (file: FileEntry) => {
    if (!activeFolder) return
    if (file.type === 'text' || file.type === 'subtitle') {
      openTextPreview(activeFolder, file.name)
    }
  }

  // ─── Escape key handling ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textModal) { setTextModal(null); return }
        if (confirmDelete) { setConfirmDelete(null); return }
        if (activeFolder) { closeFolder(); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [textModal, confirmDelete, activeFolder])

  // ─── Render: Folder Detail ───

  if (activeFolder) {
    const folderMeta = folders.find(f => f.name === activeFolder)
    const totalFileSize = files.reduce((sum, f) => sum + f.size, 0)

    return (
      <>
        {/* Back header */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="files-detail-header">
            <button className="files-back-btn" onClick={closeFolder}>
              <ChevronLeft size={14} strokeWidth={1.5} /> Back
            </button>
            <span className="files-detail-title">{activeFolderTitle}</span>
          </div>
        </div>

        {/* Video preview */}
        {previewVideo && activeFolder && (
          <div className="files-video-preview">
            <video
              controls
              preload="metadata"
              poster={thumbnail ? serveUrl(activeFolder, thumbnail) : undefined}
              src={serveUrl(activeFolder, previewVideo)}
            />
          </div>
        )}

        {/* Folder meta */}
        <div className="files-folder-meta">
          {folderMeta && (
            <>
              <span className="files-badge">{folderMeta.mode}</span>
              {folderMeta.channel && <span className="files-meta-item">{folderMeta.channel}</span>}
              <span className="files-meta-sep"></span>
              <span className="files-meta-item">{formatBytes(totalFileSize)}</span>
              {folderMeta.duration > 0 && (
                <>
                  <span className="files-meta-sep"></span>
                  <span className="files-meta-item">{formatDuration(folderMeta.duration)}</span>
                </>
              )}
            </>
          )}
          <div style={{ flex: 1 }} />
          {confirmDelete?.folder === activeFolder && !confirmDelete?.file ? (
            <div className="confirm-group">
              <button
                className="btn-confirm-delete"
                onClick={() => handleDeleteFolder(activeFolder)}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete folder'}
              </button>
              <button className="btn-cancel" onClick={() => setConfirmDelete(null)}>Keep</button>
            </div>
          ) : (
            <button
              className="files-delete-folder-btn"
              onClick={() => setConfirmDelete({ folder: activeFolder })}
            >
              <Trash2 size={12} strokeWidth={1.5} /> Delete folder
            </button>
          )}
        </div>

        {/* File list */}
        <div className="section-label">
          Files
          <span className="section-count">{files.filter(f => f.name !== 'info.json').length}</span>
        </div>
        <div className="card">
          {detailLoading ? (
            <div className="files-loading">Loading...</div>
          ) : (
            files.filter(f => f.name !== 'info.json').map(file => {
              const isClickable = file.type === 'text' || file.type === 'subtitle'

              return (
                <div
                  key={file.name}
                  className={`file-row${isClickable ? ' file-row--clickable' : ''}`}
                  onClick={isClickable ? () => handleFileClick(file) : undefined}
                >
                  <div className={fileIconClass(file.type)}>
                    {fileIcon(file.type, file.isProxy)}
                  </div>
                  <div className="file-info">
                    <span className="file-name">{file.name}</span>
                  </div>
                  <span className="file-ext">{fileLabel(file)}</span>
                  <span className="file-size">{formatBytes(file.size)}</span>
                  <div className="file-actions">
                    {(file.type === 'text' || file.type === 'subtitle') && (
                      <button
                        className="files-btn-sm"
                        onClick={e => { e.stopPropagation(); openTextPreview(activeFolder, file.name) }}
                      >
                        View
                      </button>
                    )}
                    {confirmDelete?.folder === activeFolder && confirmDelete?.file === file.name ? (
                      <div className="confirm-group" onClick={e => e.stopPropagation()}>
                        <button
                          className="btn-confirm-delete"
                          onClick={() => handleDeleteFile(activeFolder, file.name)}
                          disabled={deleting}
                        >
                          {deleting ? '...' : 'Delete'}
                        </button>
                        <button className="btn-cancel" onClick={() => setConfirmDelete(null)}>Keep</button>
                      </div>
                    ) : (
                      <button
                        className="files-btn-sm files-btn-sm--danger"
                        onClick={e => {
                          e.stopPropagation()
                          setConfirmDelete({ folder: activeFolder, file: file.name })
                        }}
                      >
                        <X size={11} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

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
                  <button className="preview-close" onClick={() => setTextModal(null)}>
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <div className="files-text-body">
                <pre>{textModal.content}</pre>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ─── Render: Folder List ───

  return (
    <>
      {/* Disk usage */}
      <div className="files-disk-bar">
        <div className="files-disk-label"><strong>{formatBytes(totalSize)}</strong> used</div>
        <div className="files-disk-track">
          <div className="files-disk-fill" style={{ width: `${Math.min((totalSize / (80 * 1073741824)) * 100, 100)}%` }} />
        </div>
      </div>

      {/* Search + count */}
      <div className="files-toolbar">
        <div className="section-label" style={{ margin: 0 }}>
          Downloads
          <span className="section-count">{totalFolders}</span>
        </div>
        <div className="files-search-wrap">
          <Search size={13} strokeWidth={1.5} className="files-search-icon" />
          <input
            ref={searchRef}
            type="text"
            className="files-search-input"
            placeholder="Search..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            spellCheck={false}
          />
          {search && (
            <button className="files-search-clear" onClick={() => { setSearch(''); fetchFolders() }}>
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Folder list */}
      {loading ? (
        <div className="files-loading">Loading...</div>
      ) : folders.length === 0 ? (
        <div className="empty-state">
          <HardDrive size={28} strokeWidth={0.8} />
          <p>{search ? 'No matches found' : 'No downloads yet'}</p>
          <p className="empty-hint">{search ? 'Try a different search' : 'Downloads from the Dump tab will appear here'}</p>
        </div>
      ) : (
        <div className="card">
          {folders.map(folder => (
            <div key={folder.name} className="folder-row" onClick={() => openFolder(folder)}>
              <div className="folder-thumb">
                {folder.thumbnailFile ? (
                  <img
                    src={serveUrl(folder.name, folder.thumbnailFile)}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="folder-thumb-placeholder">
                    {folder.mode === 'wav' ? <AudioLines size={16} strokeWidth={1} /> :
                     folder.mode === 'text' ? <FileText size={16} strokeWidth={1} /> :
                     <Film size={16} strokeWidth={1} />}
                  </div>
                )}
              </div>
              <div className="folder-info">
                <div className="folder-name">{folder.title}</div>
                <div className="folder-meta">
                  {folder.channel && <>{folder.channel}<span className="folder-meta-sep"></span></>}
                  {folder.fileCount} files
                  <span className="folder-meta-sep"></span>
                  {timeAgo(folder.modifiedAt)}
                </div>
              </div>
              <span className="files-badge">{folder.mode}</span>
              <span className="folder-size">{formatBytes(folder.totalSize)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
