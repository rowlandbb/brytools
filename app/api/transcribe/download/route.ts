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
    return new NextResponse(content, { headers: { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="${fileName}"` } })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
