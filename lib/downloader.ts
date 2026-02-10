import { spawn, ChildProcess } from 'child_process'
import { updateDownload, getActiveCount, getNextQueued, getDownload } from './db'
import { cleanSrtFile } from './srt-cleaner'
import { existsSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs'
import path from 'path'

const DUMP_DIR = '/Volumes/ME Backup02/_Dump'
const MAX_CONCURRENT = 2

// Track running processes
const activeProcesses = new Map<string, ChildProcess>()

// Progress regex patterns from yt-dlp stdout
const PROGRESS_RE = /\[download\]\s+(\d+\.?\d*)%\s+of\s+\S+\s+at\s+(\S+)\s+ETA\s+(\S+)/
const PROGRESS_RE2 = /\[download\]\s+(\d+\.?\d*)%\s+of\s+\S+\s+in\s+\S+\s+at\s+(\S+)/
const FRAGMENT_RE = /\[download\]\s+Downloading\s+(?:fragment|video)\s+(\d+)\s+of\s+(\d+)/

function getYtdlpArgs(url: string, mode: string): string[] {
  const base = [
    '--no-colors',
    '--newline',
    '--restrict-filenames',
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
        '--embed-thumbnail', '--write-thumbnail', '--add-metadata', '--write-description',
        '-o', path.join(DUMP_DIR, '%(extractor_key)s_%(upload_date>%m_%d_%y)s_%(channel)s_%(title)s_%(id)s/MASTER_%(extractor_key)s_%(upload_date>%m_%d_%y)s_%(channel)s_%(title)s_%(id)s.%(ext)s'),
        url,
      ]

    case 'text':
      return [
        ...base,
        '--skip-download',
        '--write-auto-sub', '--write-sub', '--sub-lang', 'en', '--convert-subs', 'srt',
        '-o', path.join(DUMP_DIR, '%(channel)s/%(extractor_key)s_%(upload_date>%m_%d_%y)s_%(channel)s_%(title)s_%(id)s.%(ext)s'),
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
        '-o', path.join(DUMP_DIR, '%(extractor_key)s_%(upload_date>%m_%d_%y)s_%(channel)s_%(title)s_%(id)s/AUDIO_%(extractor_key)s_%(upload_date>%m_%d_%y)s_%(channel)s_%(title)s_%(id)s.%(ext)s'),
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

  try {
    if (mode === 'full') {
      // Create PROXY from MASTER
      const files = readdirSync(outputDir)
      const master = files.find(f => f.startsWith('MASTER_') && f.endsWith('.mp4'))
      if (master) {
        const masterPath = path.join(outputDir, master)
        const proxyPath = path.join(outputDir, master.replace('MASTER_', 'PROXY_'))
        
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y', '-i', masterPath,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-vf', 'scale=-2:1080',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            proxyPath,
          ])
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
        require('fs').writeFileSync(txtPath, cleanText, 'utf-8')
      }
    } else if (mode === 'text') {
      // Clean all SRT files in the output
      const parentDir = outputDir
      const files = readdirSync(parentDir)
      for (const f of files) {
        if (f.endsWith('.srt')) {
          const srtPath = path.join(parentDir, f)
          const cleanText = cleanSrtFile(srtPath, url)
          const txtPath = srtPath.replace(/\.srt$/, '.txt')
          require('fs').writeFileSync(txtPath, cleanText, 'utf-8')
        }
      }
    } else if (mode === 'wav') {
      // Convert to 48kHz 16-bit PCM
      const files = readdirSync(outputDir)
      const wav = files.find(f => f.startsWith('AUDIO_') && f.endsWith('.wav'))
      if (wav) {
        const wavPath = path.join(outputDir, wav)
        const tmpPath = wavPath + '.tmp.wav'
        
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y', '-i', wavPath,
            '-ar', '48000', '-ac', '2', '-sample_fmt', 's16', '-c:a', 'pcm_s16le',
            tmpPath,
          ])
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

  const args = getYtdlpArgs(row.url, row.mode)
  
  updateDownload(id, { 
    status: 'downloading', 
    started_at: new Date().toISOString(),
    progress_percent: 0,
  })

  const proc = spawn('yt-dlp', args, { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } })
  activeProcesses.set(id, proc)
  updateDownload(id, { pid: proc.pid || null })

  let lastOutputDir = ''

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
      const destPath = destMatch[1]
      const dir = path.dirname(destPath)
      if (dir !== DUMP_DIR) {
        lastOutputDir = dir
        updateDownload(id, { output_dir: dir })
      }
    }

    // Also detect from merger output
    const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/)
    if (mergeMatch) {
      const dir = path.dirname(mergeMatch[1])
      if (dir !== DUMP_DIR) {
        lastOutputDir = dir
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
    // yt-dlp sends some progress to stderr too
    const lines = stderr.split('\n')
    stderr = lines.pop() || ''
    for (const line of lines) handleLine(line)
  })

  proc.on('close', (code) => {
    activeProcesses.delete(id)
    
    const current = getDownload(id)
    if (!current || current.status === 'cancelled') return

    if (code === 0) {
      // Detect output dir if we haven't yet
      if (!lastOutputDir) {
        const found = findOutputDir(row.url)
        if (found) lastOutputDir = found
      }
      if (lastOutputDir) {
        updateDownload(id, { output_dir: lastOutputDir })
      }
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
