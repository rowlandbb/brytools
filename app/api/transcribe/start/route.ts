import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const WATCH_FOLDER = '/Volumes/ME Backup02/BryTranscribe'
const MAC_STUDIO_IP = '100.100.179.121'
const MODELS: Record<string, { whisperModel: string; label: string }> = {
  turbo: { whisperModel: 'tiny', label: 'Turbo' },
  fast: { whisperModel: 'base', label: 'Fast' },
  balanced: { whisperModel: 'medium', label: 'Balanced' },
  quality: { whisperModel: 'large-v3', label: 'Quality' },
}

export async function POST(request: NextRequest) {
  try {
    const { filenames, model } = await request.json()
    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) return NextResponse.json({ error: 'No files specified' }, { status: 400 })
    const preset = model || 'quality'
    const modelInfo = MODELS[preset] || MODELS['quality']
    const started: string[] = []
    for (const filename of filenames) {
      if (filename.includes('..') || filename.includes('/')) continue
      const filePath = path.join(WATCH_FOLDER, filename)
      if (!existsSync(filePath)) continue
      const sidecarPath = path.join(WATCH_FOLDER, `${filename}.model`)
      await writeFile(sidecarPath, JSON.stringify({ preset, whisperModel: modelInfo.whisperModel, label: modelInfo.label, startedAt: new Date().toISOString() }))
      started.push(filename)
    }
    triggerProcessing().catch(err => console.error('Failed to trigger:', err))
    return NextResponse.json({ success: true, started, model: modelInfo.label })
  } catch (error) {
    console.error('Start error:', error)
    return NextResponse.json({ error: 'Start failed' }, { status: 500 })
  }
}

async function triggerProcessing() {
  try {
    await execAsync(`ssh bryan@${MAC_STUDIO_IP} "pgrep -f batch_transcribe.py || (cd ~/models/whisper && nohup python3 batch_transcribe.py auto > /tmp/bryscribe-studio.log 2>&1 &)"`, { timeout: 10000 })
  } catch (err) { console.error('SSH trigger failed:', err) }
}
