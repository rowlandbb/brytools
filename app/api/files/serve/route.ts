import { NextRequest, NextResponse } from 'next/server'
import { existsSync, statSync, readFileSync } from 'fs'
import path from 'path'

const DUMP_DIR = '/Volumes/ME Backup02/_Dump'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.srt': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.description': 'text/plain; charset=utf-8',
  '.json': 'application/json',
}

function dlHeaders(download: boolean, filename: string): Record<string, string> {
  if (!download) return {}
  return { 'Content-Disposition': `attachment; filename="${filename}"` }
}

export async function GET(req: NextRequest) {
  try {
    const folder = req.nextUrl.searchParams.get('folder')
    const file = req.nextUrl.searchParams.get('file')
    const download = req.nextUrl.searchParams.get('dl') === '1'

    if (!folder || !file) {
      return NextResponse.json({ error: 'folder and file params required' }, { status: 400 })
    }

    const filePath = path.join(DUMP_DIR, folder, file)
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(path.resolve(DUMP_DIR))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const stat = statSync(filePath)
    const ext = path.extname(file).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

    // Download mode: force download for any file type
    if (download) {
      const content = readFileSync(filePath)
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(stat.size),
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file)}"`,
        },
      })
    }

    // Handle range requests for video/audio streaming
    const rangeHeader = req.headers.get('range')

    if (rangeHeader && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 5 * 1024 * 1024 - 1, stat.size - 1)
      const chunkSize = end - start + 1

      const buffer = Buffer.alloc(chunkSize)
      const fd = require('fs').openSync(filePath, 'r')
      require('fs').readSync(fd, buffer, 0, chunkSize, start)
      require('fs').closeSync(fd)

      return new NextResponse(buffer, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    // Text files: return content directly
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const content = readFileSync(filePath, 'utf-8')
      return new NextResponse(content, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=60',
        },
      })
    }

    // Images and other files
    const content = readFileSync(filePath)
    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (err) {
    console.error('Files serve error:', err)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
