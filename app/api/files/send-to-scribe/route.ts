import { NextRequest, NextResponse } from 'next/server'
import { existsSync, copyFileSync } from 'fs'
import path from 'path'

const DUMP_DIR = '/Volumes/ME Backup02/_Dump'
const SCRIBE_DIR = '/Volumes/ME Backup02/BryTranscribe'

const ALLOWED_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.wav', '.mp3', '.m4a', '.flac', '.aac'])

export async function POST(req: NextRequest) {
  try {
    const { folder, file } = await req.json()
    if (!folder || !file) {
      return NextResponse.json({ error: 'folder and file required' }, { status: 400 })
    }

    const srcPath = path.join(DUMP_DIR, folder, file)
    const resolved = path.resolve(srcPath)
    if (!resolved.startsWith(path.resolve(DUMP_DIR))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!existsSync(srcPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const ext = path.extname(file).toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ error: 'Only video/audio files can be sent to Scribe' }, { status: 400 })
    }

    const destPath = path.join(SCRIBE_DIR, file)

    // If file already exists in Scribe dir, add a suffix
    let finalDest = destPath
    if (existsSync(destPath)) {
      const base = path.basename(file, ext)
      let i = 1
      while (existsSync(finalDest)) {
        finalDest = path.join(SCRIBE_DIR, `${base}_${i}${ext}`)
        i++
      }
    }

    copyFileSync(srcPath, finalDest)

    return NextResponse.json({
      success: true,
      filename: path.basename(finalDest),
    })
  } catch (err) {
    console.error('Send to scribe error:', err)
    return NextResponse.json({ error: 'Failed to send to Scribe' }, { status: 500 })
  }
}
