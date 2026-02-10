import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DONE_FOLDER = '/Volumes/ME Backup02/BryTranscribe/Done'

export async function GET() {
  try {
    if (!existsSync(DONE_FOLDER)) return NextResponse.json({ files: [], totalSize: 0 })
    const entries = await readdir(DONE_FOLDER)
    const files = []
    let totalSize = 0
    for (const name of entries) {
      const fullPath = path.join(DONE_FOLDER, name)
      try {
        const s = await stat(fullPath)
        if (s.isFile()) { files.push({ name, size: s.size, modifiedAt: s.mtime.toISOString() }); totalSize += s.size }
      } catch {}
    }
    files.sort((a, b) => b.size - a.size)
    return NextResponse.json({ files, totalSize })
  } catch (error) {
    console.error('Storage list error:', error)
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const fileName = request.nextUrl.searchParams.get('file')
    if (!fileName) return NextResponse.json({ error: 'No file specified' }, { status: 400 })
    const safeName = path.basename(fileName)
    const fullPath = path.join(DONE_FOLDER, safeName)
    if (!existsSync(fullPath)) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    await unlink(fullPath)
    return NextResponse.json({ success: true, deleted: safeName })
  } catch (error) {
    console.error('Storage delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
