import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, rename } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const WATCH_FOLDER = '/Volumes/ME Backup02/BryTranscribe'
const DONE_FOLDER = path.join(WATCH_FOLDER, 'Done')
const PROGRESS_FOLDER = path.join(WATCH_FOLDER, 'progress')

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json()
    if (!filename || filename.includes('..') || filename.includes('/')) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    const filePath = path.join(WATCH_FOLDER, filename)
    const cancelPath = path.join(WATCH_FOLDER, `${filename}.cancel`)
    const sidecarPath = path.join(WATCH_FOLDER, `${filename}.model`)
    const progressPath = path.join(PROGRESS_FOLDER, `${filename}.json`)
    const donePath = path.join(DONE_FOLDER, filename)
    await writeFile(cancelPath, JSON.stringify({ cancelledAt: new Date().toISOString() }))
    if (existsSync(filePath)) { try { await rename(filePath, donePath) } catch {} }
    if (existsSync(sidecarPath)) { try { await unlink(sidecarPath) } catch {} }
    if (existsSync(progressPath)) { try { await unlink(progressPath) } catch {} }
    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error('Cancel error:', error)
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 })
  }
}
