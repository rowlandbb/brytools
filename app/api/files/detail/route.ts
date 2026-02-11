import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, statSync, existsSync, readFileSync, unlinkSync, rmSync } from 'fs'
import path from 'path'

const DUMP_DIR = '/Volumes/ME Backup02/_Dump'

interface FileEntry {
  name: string
  size: number
  ext: string
  type: 'video' | 'audio' | 'subtitle' | 'text' | 'image' | 'data'
  isProxy: boolean
}

function classifyFile(name: string): FileEntry['type'] {
  const ext = path.extname(name).toLowerCase()
  if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext)) return 'video'
  if (['.wav', '.mp3', '.flac', '.aac', '.m4a'].includes(ext)) return 'audio'
  if (['.srt', '.vtt', '.ass'].includes(ext)) return 'subtitle'
  if (['.txt', '.description', '.json'].includes(ext)) return 'text'
  if (['.webp', '.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image'
  return 'data'
}

// GET: List files in a folder
export async function GET(req: NextRequest) {
  try {
    const folder = req.nextUrl.searchParams.get('folder')
    if (!folder) return NextResponse.json({ error: 'folder param required' }, { status: 400 })

    const fullPath = path.join(DUMP_DIR, folder)

    // Security: ensure the resolved path is within DUMP_DIR
    const resolved = path.resolve(fullPath)
    if (!resolved.startsWith(path.resolve(DUMP_DIR))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    const entries = readdirSync(fullPath)
      .filter(f => !f.startsWith('.'))
      .map(name => {
        const filePath = path.join(fullPath, name)
        const stat = statSync(filePath)
        const ext = path.extname(name).toLowerCase().replace('.', '')
        return {
          name,
          size: stat.size,
          ext,
          type: classifyFile(name),
          isProxy: name.toLowerCase().includes('_proxy') || name.toLowerCase().includes('proxy_'),
        } as FileEntry
      })
      .sort((a, b) => {
        // Sort: videos first (proxy before master), then subtitles, text, images, data
        const order: Record<FileEntry['type'], number> = { video: 0, audio: 1, subtitle: 2, text: 3, image: 4, data: 5 }
        const diff = order[a.type] - order[b.type]
        if (diff !== 0) return diff
        // Within videos, proxy first
        if (a.isProxy && !b.isProxy) return -1
        if (!a.isProxy && b.isProxy) return 1
        return a.name.localeCompare(b.name)
      })

    // Read info.json if present
    let info: Record<string, unknown> = {}
    const infoPath = path.join(fullPath, 'info.json')
    if (existsSync(infoPath)) {
      try { info = JSON.parse(readFileSync(infoPath, 'utf-8')) } catch {}
    }

    // Find proxy or master video for preview
    const proxyVideo = entries.find(e => e.type === 'video' && e.isProxy)
    const masterVideo = entries.find(e => e.type === 'video' && !e.isProxy)
    const previewVideo = proxyVideo || masterVideo || null

    // Find thumbnail
    const thumbnail = entries.find(e => e.type === 'image')

    return NextResponse.json({
      folder,
      files: entries,
      info,
      previewVideo: previewVideo?.name || null,
      thumbnail: thumbnail?.name || null,
    })
  } catch (err) {
    console.error('Files detail error:', err)
    return NextResponse.json({ error: 'Failed to read folder' }, { status: 500 })
  }
}

// DELETE: Delete a file or entire folder
export async function DELETE(req: NextRequest) {
  try {
    const { folder, file } = await req.json()
    if (!folder) return NextResponse.json({ error: 'folder required' }, { status: 400 })

    const folderPath = path.join(DUMP_DIR, folder)
    const resolved = path.resolve(folderPath)
    if (!resolved.startsWith(path.resolve(DUMP_DIR))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!existsSync(folderPath)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (file) {
      // Delete specific file
      const filePath = path.join(folderPath, file)
      const resolvedFile = path.resolve(filePath)
      if (!resolvedFile.startsWith(resolved)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
      }
      if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      unlinkSync(filePath)

      // If folder is now empty (or only info.json), clean up
      const remaining = readdirSync(folderPath).filter(f => !f.startsWith('.'))
      if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === 'info.json')) {
        rmSync(folderPath, { recursive: true, force: true })
        return NextResponse.json({ deleted: file, folderRemoved: true })
      }

      return NextResponse.json({ deleted: file, folderRemoved: false })
    } else {
      // Delete entire folder
      rmSync(folderPath, { recursive: true, force: true })
      return NextResponse.json({ deleted: folder, folderRemoved: true })
    }
  } catch (err) {
    console.error('Files delete error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
