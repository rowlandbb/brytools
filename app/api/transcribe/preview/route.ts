import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const TRANSCRIPTIONS_FOLDER = '/Volumes/ME Backup02/BryTranscribe/transcriptions'

export async function GET(request: NextRequest) {
  try {
    const fileName = request.nextUrl.searchParams.get('file')
    if (!fileName) return NextResponse.json({ error: 'No file specified' }, { status: 400 })
    const transcriptPath = path.join(TRANSCRIPTIONS_FOLDER, fileName)
    if (!existsSync(transcriptPath)) return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    const content = await readFile(transcriptPath, 'utf-8')
    return NextResponse.json({ content, filename: fileName })
  } catch (error) {
    console.error('Preview error:', error)
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 })
  }
}
