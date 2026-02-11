import { spawn, ChildProcess } from 'child_process'
import { updateDownload, getActiveCount, getNextQueued, getDownload } from './db'
import { cleanSrtFile } from './srt-cleaner'
import { existsSync, readdirSync, statSync, unlinkSync, renameSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'

const DUMP_DIR = '/Volumes/ME Backup02/_Dump'
const MAX_CONCURRENT = 2
const MAX_TITLE_LENGTH = 70

// Track running processes
const activeProcesses = new Map<string, ChildProcess>()

// Progress regex patterns from yt-dlp stdout
const PROGRESS_RE = /\[download\]\s+(\d+\.?\d*)%\s+of\s+\S+\s+at\s+(\S+)\s+ETA\s+(\S+)/
const PROGRESS_RE2 = /\[download\]\s+(\d+\.?\d*)%\s+of\s+\S+\s+in\s+\S+\s+at\s+(\S+)/
const FRAGMENT_RE = /\[download\]\s+Downloading\s+(?:fragment|video)\s+(\d+)\s+of\s+(\d+)/

/**
 * Sanitize a string for use as a filename/folder name.
 * Removes filesystem-unsafe characters but keeps spaces, hyphens, etc. readable.
 */
function sanitize(str: string): string {
  return str
    .replace(/[\/\\:*?"<>|]/g, '')   // remove unsafe chars
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
}

/**
 * Truncate title at a word boundary, max length chars.
 */
function truncateTitle(title: string, max: number = MAX_TITLE_LENGTH): string {
  const clean = sanitize(title)
  if (clean.length <= max) return clean
  const truncated = clean.slice(0, max)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > max * 0.5) return truncated.slice(0, lastSpace).trim()
  return truncated.trim()
}

/**
 * Build the clean folder name and base filename for a download.
 * Folder: "Title of Video [videoID]"
 * Files:  "Title of Video.ext", "Title of Video_proxy.ext"
 */
function buildOutputNames(title: string, videoId: string): { folderName: string; baseName: string } {
  const cleanTitle = truncateTitle(title)
  return {
    folderName: `${cleanTitle} [${videoId}]`,
    baseName: cleanTitle,
  }
}

/**
 * Write an info.json with full metadata into the output folder.
 */
function writeInfoJson(outputDir: string, info: Record<string, unknown>): void {
  try {
    const infoPath = path.join(outputDir, 'info.json')
    writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8')
  } catch {}
}

function getYtdlpArgs(url: string, mode: string, title: string, videoId: string): string[] {
  const { folderName, baseName } = buildOutputNames(title, videoId)
  const folderPath = path.join(DUMP_DIR, folderName)

  const base = [
    '--no-colors',
    '--newline',
  ]

  switch (mode) {
    case 'full':
      return [
        ...base,
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=android',
        '-f', 'bv*+ba/b',
        '--merge-output-format', 'mp4',
        '--write-auto-sub', '--write-sub', '--sub-lang', 'en', '--convert-subs', 'srt',
        '--write-thumbnail', '--add-metadata', '--write-description',
        '-o', path.join(folderPath, `${baseName}.%(ext)s`),
        url,
      ]

    case 'text':
      return [
        ...base,
        '--skip-download',
        '--write-auto-sub', '--write-sub', '--sub-lang', 'en', '--convert-subs', 'srt',
        '-o', path.join(folderPath, `${baseName}.%(ext)s`),
        url,
      ]

    case 'wav':
      return [
        ...base,
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=android',
        '-f', 'ba/b',
        '-x', '--audio-format', 'wav', '--audio-quality', '0',
        '--write-thumbnail', '--write-description',
        '-o', path.join(folderPath, `${baseName}.%(ext)s`),
        url,
      ]

    default:
      return [...base, url]
  }
}

function parseProgress(line: string): { percent?: number; speed?: string; eta?: string } | null {
  let m = PROGRESS_RE.exec(line)
  if (m) return { percent: parseFloat(m[1]), speed: m[2], eta: m[3] }

  m = PROGRESS_RE2.exec(line)
  if (m) return { percent: parseFloat(m[1]), speed: m[2] }

  m = FRAGMENT_RE.exec(line)
  if (m) {
    const current = parseInt(m[1])
    const total = parseInt(m[2])
    return { percent: Math.round((current / total) * 100) }
  }

  return null
}

function findOutputDir(url: string): string | null {
  // Look for the most recently modified directory in _Dump
  try {
    const entries = readdirSync(DUMP_DIR)
      .filter(e => !e.startsWith('.') && statSync(path.join(DUMP_DIR, e)).isDirectory())
      .map(e => ({ name: e, mtime: statSync(path.join(DUMP_DIR, e)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    
    if (entries.length > 0) return path.join(DUMP_DIR, entries[0].name)
  } catch {}
  return null
}

function getDirSize(dirPath: string): number {
  let total = 0
  try {
    const entries = readdirSync(dirPath)
    for (const entry of entries) {
      const full = path.join(dirPath, entry)
      const stat = statSync(full)
      if (stat.isFile()) total += stat.size
      else if (stat.isDirectory()) total += getDirSize(full)
    }
  } catch {}
  return total
}

async function postProcess(id: string, mode: string, url: string): Promise<void> {
  const row = getDownload(id)
  if (!row || row.status === 'cancelled') return

  updateDownload(id, { status: 'processing', progress_percent: 100 })

  const outputDir = row.output_dir || findOutputDir(url)
  if (!outputDir) {
    updateDownload(id, { status: 'completed', completed_at: new Date().toISOString() })
    return
  }

  // Write info.json with metadata
  writeInfoJson(outputDir, {
    title: row.title,
    channel: row.channel,
    url: row.url,
    duration: row.duration,
    mode: row.mode,
    downloaded_at: new Date().toISOString(),
  })

  try {
    if (mode === 'full') {
      const files = readdirSync(outputDir)
      
      // Create PROXY from the main mp4
      const master = files.find(f => f.endsWith('.mp4'))
      if (master) {
        const masterPath = path.join(outputDir, master)
        const proxyName = master.replace(/\.mp4$/, '_proxy.mp4')
        const proxyPath = path.join(outputDir, proxyName)
        
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y', '-i', masterPath,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-vf', 'scale=-2:1080',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            proxyPath,
          ], { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } })
          ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
          ffmpeg.on('error', reject)
        })
      }

      // Clean SRT if present
      const srt = files.find(f => f.endsWith('.en.srt') || f.endsWith('.srt'))
      if (srt) {
        const srtPath = path.join(outputDir, srt)
        const cleanText = cleanSrtFile(srtPath, url)
        const txtPath = srtPath.replace(/\.srt$/, '.txt')
        writeFileSync(txtPath, cleanText, 'utf-8')
      }
    } else if (mode === 'text') {
      const files = readdirSync(outputDir)
      for (const f of files) {
        if (f.endsWith('.srt')) {
          const srtPath = path.join(outputDir, f)
          const cleanText = cleanSrtFile(srtPath, url)
          const txtPath = srtPath.replace(/\.srt$/, '.txt')
          writeFileSync(txtPath, cleanText, 'utf-8')
        }
      }
    } else if (mode === 'wav') {
      const files = readdirSync(outputDir)
      const wav = files.find(f => f.endsWith('.wav'))
      if (wav) {
        const wavPath = path.join(outputDir, wav)
        const tmpPath = wavPath + '.tmp.wav'
        
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y', '-i', wavPath,
            '-ar', '48000', '-ac', '2', '-sample_fmt', 's16', '-c:a', 'pcm_s16le',
            tmpPath,
          ], { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } })
          ffmpeg.on('close', code => {
            if (code === 0) {
              unlinkSync(wavPath)
              renameSync(tmpPath, wavPath)
              resolve()
            } else {
              try { unlinkSync(tmpPath) } catch {}
              reject(new Error(`ffmpeg exited ${code}`))
            }
          })
          ffmpeg.on('error', reject)
        })
      }
    }
  } catch (err) {
    console.error(`Post-processing error for ${id}:`, err)
  }

  // Calculate final file size
  const size = getDirSize(outputDir)
  updateDownload(id, { 
    status: 'completed', 
    completed_at: new Date().toISOString(),
    file_size: size,
    output_dir: outputDir,
  })
}

export function startDownload(id: string): void {
  const row = getDownload(id)
  if (!row) return

  // Extract video ID from URL for folder naming
  const videoId = extractVideoId(row.url) || id
  const title = row.title || 'Untitled'

  const args = getYtdlpArgs(row.url, row.mode, title, videoId)

  // Pre-calculate and store the output directory
  const { folderName } = buildOutputNames(title, videoId)
  const expectedDir = path.join(DUMP_DIR, folderName)
  
  updateDownload(id, { 
    status: 'downloading', 
    started_at: new Date().toISOString(),
    progress_percent: 0,
    output_dir: expectedDir,
  })

  const proc = spawn('yt-dlp', args, { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } })
  activeProcesses.set(id, proc)
  updateDownload(id, { pid: proc.pid || null })

  const handleLine = (line: string) => {
    // Check for cancellation
    const current = getDownload(id)
    if (!current || current.status === 'cancelled') {
      proc.kill('SIGTERM')
      return
    }

    // Detect output directory from yt-dlp's destination messages
    const destMatch = line.match(/\[download\] Destination: (.+)/)
    if (destMatch) {
      const dir = path.dirname(destMatch[1])
      if (dir !== DUMP_DIR) {
        updateDownload(id, { output_dir: dir })
      }
    }

    const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/)
    if (mergeMatch) {
      const dir = path.dirname(mergeMatch[1])
      if (dir !== DUMP_DIR) {
        updateDownload(id, { output_dir: dir })
      }
    }

    // Parse progress
    const prog = parseProgress(line)
    if (prog) {
      const updates: Partial<typeof row> = {}
      if (prog.percent !== undefined) updates.progress_percent = prog.percent
      if (prog.speed) updates.speed = prog.speed
      if (prog.eta) updates.eta = prog.eta
      if (Object.keys(updates).length > 0) {
        updateDownload(id, updates)
      }
    }
  }

  let stdout = ''
  proc.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString()
    const lines = stdout.split('\n')
    stdout = lines.pop() || ''
    for (const line of lines) handleLine(line)
  })

  let stderr = ''
  proc.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString()
    const lines = stderr.split('\n')
    stderr = lines.pop() || ''
    for (const line of lines) handleLine(line)
  })

  proc.on('close', (code) => {
    activeProcesses.delete(id)
    
    const current = getDownload(id)
    if (!current || current.status === 'cancelled') return

    if (code === 0) {
      postProcess(id, row.mode, row.url).then(() => processQueue())
    } else {
      updateDownload(id, { 
        status: 'error', 
        error: `yt-dlp exited with code ${code}`,
        completed_at: new Date().toISOString(),
      })
      processQueue()
    }
  })

  proc.on('error', (err) => {
    activeProcesses.delete(id)
    updateDownload(id, { 
      status: 'error', 
      error: err.message,
      completed_at: new Date().toISOString(),
    })
    processQueue()
  })
}

/**
 * Extract video ID from various URL formats.
 */
function extractVideoId(url: string): string | null {
  // YouTube: various formats
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return ytMatch[1]

  // Twitter/X: status ID
  const twMatch = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)
  if (twMatch) return twMatch[1]

  // Generic: use last path segment or query param
  try {
    const u = new URL(url)
    const v = u.searchParams.get('v')
    if (v) return v
    const segments = u.pathname.split('/').filter(Boolean)
    if (segments.length > 0) return segments[segments.length - 1].slice(0, 20)
  } catch {}

  return null
}

export function cancelDownload(id: string): boolean {
  const proc = activeProcesses.get(id)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(id)
  }
  updateDownload(id, { 
    status: 'cancelled', 
    completed_at: new Date().toISOString(),
  })
  processQueue()
  return true
}

export function processQueue(): void {
  const active = getActiveCount()
  if (active >= MAX_CONCURRENT) return

  const slotsAvailable = MAX_CONCURRENT - active
  for (let i = 0; i < slotsAvailable; i++) {
    const next = getNextQueued()
    if (!next) break
    startDownload(next.id)
  }
}

export function getActiveProcessIds(): string[] {
  return Array.from(activeProcesses.keys())
}
