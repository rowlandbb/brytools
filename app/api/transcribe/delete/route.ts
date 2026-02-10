import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const TRANSCRIPTIONS_FOLDER = '/Volumes/ME Backup02/BryTranscribe/transcriptions'

export async function DELETE(request: NextRequest) {
  try {
    const fileName = request.nextUrl.searchParams.get('file')
    if (!fileName) return NextResponse.json({ error: 'No file specified' }, { status: 400 })
    const safeName = path.basename(fileName)
    const filePath = path.join(TRANSCRIPTIONS_FOLDER, safeName)
    if (!existsSync(filePath)) return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    await unlink(filePath)
    return NextResponse.json({ success: true, deleted: safeName })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
