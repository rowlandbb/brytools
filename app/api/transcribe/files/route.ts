import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const WATCH_FOLDER = '/Volumes/ME Backup02/BryTranscribe'
const TRANSCRIPTIONS_FOLDER = path.join(WATCH_FOLDER, 'transcriptions')
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.mp3', '.wav', '.m4a']
const TRANSCRIPT_EXTENSIONS = ['.txt', '.srt', '.vtt']

interface FileInfo { name: string; size: number; uploadedAt: string; status: 'ready' | 'processing' | 'completed'; transcriptPath?: string }

export async function GET() {
  try {
    const files: FileInfo[] = []
    const watchFileStems = new Set<string>()
    if (existsSync(WATCH_FOLDER)) {
      const watchFiles = await readdir(WATCH_FOLDER)
      for (const filename of watchFiles) {
        const ext = path.extname(filename).toLowerCase()
        if (!VIDEO_EXTENSIONS.includes(ext)) continue
        const filePath = path.join(WATCH_FOLDER, filename)
        try {
          const stats = await stat(filePath)
          const hasSidecar = existsSync(path.join(WATCH_FOLDER, `${filename}.model`))
          const stem = path.parse(filename).name
          watchFileStems.add(stem)
          files.push({ name: filename, size: stats.size, uploadedAt: stats.mtime.toISOString(), status: hasSidecar ? 'processing' : 'ready' })
        } catch {}
      }
    }
    if (existsSync(TRANSCRIPTIONS_FOLDER)) {
      const transcriptFiles = await readdir(TRANSCRIPTIONS_FOLDER)
      for (const filename of transcriptFiles) {
        const ext = path.extname(filename).toLowerCase()
        if (!TRANSCRIPT_EXTENSIONS.includes(ext)) continue
        const stem = path.parse(filename).name
        if (watchFileStems.has(stem)) continue
        const filePath = path.join(TRANSCRIPTIONS_FOLDER, filename)
        try {
          const stats = await stat(filePath)
          files.push({ name: stem, size: stats.size, uploadedAt: stats.mtime.toISOString(), status: 'completed', transcriptPath: filename })
        } catch {}
      }
    }
    files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    return NextResponse.json({ files })
  } catch (error) {
    console.error('Error listing files:', error)
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
  }
}
