import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const WATCH_FOLDER = '/Volumes/ME Backup02/BryTranscribe'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!existsSync(WATCH_FOLDER)) return NextResponse.json({ error: 'Watch folder not accessible' }, { status: 500 })
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filePath = path.join(WATCH_FOLDER, file.name)
    await writeFile(filePath, buffer)
    return NextResponse.json({ success: true, filename: file.name, size: file.size })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
