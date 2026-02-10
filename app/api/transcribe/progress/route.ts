import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const PROGRESS_FOLDER = '/Volumes/ME Backup02/BryTranscribe/progress'

export async function GET(request: NextRequest) {
  try {
    const fileName = request.nextUrl.searchParams.get('file')
    if (!existsSync(PROGRESS_FOLDER)) return NextResponse.json({ progress: {} })
    const files = await readdir(PROGRESS_FOLDER)
    const progress: Record<string, unknown> = {}
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const mediaName = f.replace('.json', '')
      if (fileName && mediaName !== fileName) continue
      try { const content = await readFile(path.join(PROGRESS_FOLDER, f), 'utf-8'); progress[mediaName] = JSON.parse(content) } catch {}
    }
    return NextResponse.json({ progress })
  } catch (error) {
    console.error('Progress API error:', error)
    return NextResponse.json({ progress: {} })
  }
}
