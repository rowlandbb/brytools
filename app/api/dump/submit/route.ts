import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { insertDownload } from '@/lib/db'
import { processQueue } from '@/lib/downloader'

export async function POST(req: NextRequest) {
  try {
    const { url, mode = 'full' } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate mode
    if (!['full', 'text', 'wav'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    // Get video metadata via yt-dlp --dump-json
    let title = 'Fetching info...'
    let channel = ''
    let duration = 0
    let thumbnailUrl = ''

    try {
      const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` }
      const infoRaw = execSync(
        `yt-dlp --dump-json --no-download --no-warnings "${url}"`,
        { encoding: 'utf-8', timeout: 30000, env }
      )
      const info = JSON.parse(infoRaw)
      title = info.title || info.fulltitle || 'Unknown Title'
      channel = info.channel || info.uploader || info.creator || ''
      duration = info.duration || 0
      thumbnailUrl = info.thumbnail || ''
    } catch (err) {
      // If metadata fetch fails, we'll still queue the download
      // yt-dlp will figure it out during the actual download
      console.error('Failed to fetch video info:', err)
    }

    const id = randomUUID().slice(0, 8)

    insertDownload({
      id,
      url,
      title,
      channel,
      duration,
      mode,
      thumbnail_url: thumbnailUrl,
    })

    // Kick off queue processing
    processQueue()

    return NextResponse.json({ id, title, channel, duration })
  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'Failed to submit download' }, { status: 500 })
  }
}
