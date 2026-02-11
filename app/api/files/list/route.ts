import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, statSync, existsSync, readFileSync } from 'fs'
import path from 'path'

const DUMP_DIR = '/Volumes/ME Backup02/_Dump'

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

function getDirSize(dirPath: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(dirPath)) {
      const full = path.join(dirPath, entry)
      const stat = statSync(full)
      if (stat.isFile()) total += stat.size
      else if (stat.isDirectory()) total += getDirSize(full)
    }
  } catch {}
  return total
}

function detectMode(files: string[]): string {
  const hasVideo = files.some(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'))
  const hasWav = files.some(f => f.endsWith('.wav'))
  const hasSrt = files.some(f => f.endsWith('.srt'))
  if (hasWav && !hasVideo) return 'wav'
  if (!hasVideo && hasSrt) return 'text'
  if (hasVideo) return 'full'
  return 'full'
}

function extractVideoId(folderName: string): string | null {
  const m = folderName.match(/\[([a-zA-Z0-9_-]+)\]$/)
  return m ? m[1] : null
}

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('q')?.toLowerCase() || ''

    if (!existsSync(DUMP_DIR)) {
      return NextResponse.json({ folders: [], totalSize: 0, totalFolders: 0 })
    }

    const entries = readdirSync(DUMP_DIR)
      .filter(e => !e.startsWith('.'))
      .map(name => {
        const fullPath = path.join(DUMP_DIR, name)
        try {
          const stat = statSync(fullPath)
          if (!stat.isDirectory()) return null

          const files = readdirSync(fullPath).filter(f => !f.startsWith('.'))
          const totalSize = getDirSize(fullPath)

          // Try to read info.json for metadata
          let channel = ''
          let title = name
          let duration = 0
          const infoPath = path.join(fullPath, 'info.json')
          if (existsSync(infoPath)) {
            try {
              const info = JSON.parse(readFileSync(infoPath, 'utf-8'))
              channel = info.channel || ''
              title = info.title || name
              duration = info.duration || 0
            } catch {}
          } else {
            // Parse title from folder name, strip [videoId] suffix
            title = name.replace(/\s*\[[^\]]+\]$/, '')
          }

          const thumbnailFile = files.find(f =>
            f.endsWith('.webp') || f.endsWith('.jpg') || f.endsWith('.png')
          ) || null

          const mode = detectMode(files)
          const videoId = extractVideoId(name)

          return {
            name,
            path: fullPath,
            title,
            channel,
            mode,
            fileCount: files.filter(f => f !== 'info.json').length,
            totalSize,
            thumbnailFile,
            modifiedAt: stat.mtimeMs,
            duration,
            videoId,
          } as FolderEntry
        } catch {
          return null
        }
      })
      .filter((e): e is FolderEntry => e !== null)
      .filter(e => !search || e.title.toLowerCase().includes(search) || e.channel.toLowerCase().includes(search))
      .sort((a, b) => b.modifiedAt - a.modifiedAt)

    const totalSize = entries.reduce((sum, e) => sum + e.totalSize, 0)

    return NextResponse.json({
      folders: entries,
      totalSize,
      totalFolders: entries.length,
    })
  } catch (err) {
    console.error('Files list error:', err)
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
  }
}
