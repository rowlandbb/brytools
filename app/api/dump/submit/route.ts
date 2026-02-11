import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { insertDownload } from '@/lib/db'
import { processQueue } from '@/lib/downloader'

const ENV = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` }

interface VideoInfo {
  title: string
  channel: string
  duration: number
  thumbnailUrl: string
}

function fetchInfo(url: string, noPlaylist: boolean): VideoInfo[] {
  const flag = noPlaylist ? '--no-playlist' : '--yes-playlist'
  const raw = execSync(
    `yt-dlp --dump-json --no-download --no-warnings --flat-playlist ${flag} "${url}"`,
    { encoding: 'utf-8', timeout: 60000, env: ENV, maxBuffer: 50 * 1024 * 1024 }
  )

  // yt-dlp outputs one JSON object per line for playlists
  const lines = raw.trim().split('\n').filter(Boolean)
  return lines.map(line => {
    const info = JSON.parse(line)
    return {
      title: info.title || info.fulltitle || 'Unknown Title',
      channel: info.channel || info.uploader || info.creator || '',
      duration: info.duration || 0,
      thumbnailUrl: info.thumbnail || '',
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const { url, mode = 'full', action = 'check', noPlaylist = false } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    if (!['full', 'text', 'wav'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    // Step 1: Check URL for playlist detection
    if (action === 'check') {
      try {
        // First try with --yes-playlist to see if it's a playlist
        const items = fetchInfo(url, false)

        if (items.length > 1) {
          // It's a playlist
          return NextResponse.json({
            type: 'playlist',
            count: items.length,
            items: items.slice(0, 10), // Preview first 10
            totalDuration: items.reduce((sum, i) => sum + i.duration, 0),
          })
        } else if (items.length === 1) {
          // Single video
          return NextResponse.json({
            type: 'single',
            ...items[0],
          })
        } else {
          return NextResponse.json({ type: 'single', title: 'Unknown', channel: '', duration: 0, thumbnailUrl: '' })
        }
      } catch (err) {
        // If check fails, let them try anyway
        console.error('Check failed:', err)
        return NextResponse.json({ type: 'single', title: 'Unknown', channel: '', duration: 0, thumbnailUrl: '' })
      }
    }

    // Step 2: Actually queue the download(s)
    if (action === 'submit') {
      try {
        const items = fetchInfo(url, noPlaylist)

        if (noPlaylist || items.length <= 1) {
          // Single video
          const info = items[0] || { title: 'Unknown', channel: '', duration: 0, thumbnailUrl: '' }
          const id = randomUUID().slice(0, 8)
          insertDownload({ id, url, title: info.title, channel: info.channel, duration: info.duration, mode, thumbnail_url: info.thumbnailUrl })
          processQueue()
          return NextResponse.json({ queued: 1, ids: [id] })
        } else {
          // Queue entire playlist: extract individual URLs
          const fullItems = fetchPlaylistUrls(url)
          const ids: string[] = []

          for (const item of fullItems) {
            const id = randomUUID().slice(0, 8)
            insertDownload({
              id,
              url: item.url,
              title: item.title,
              channel: item.channel,
              duration: item.duration,
              mode,
              thumbnail_url: item.thumbnailUrl,
            })
            ids.push(id)
          }

          processQueue()
          return NextResponse.json({ queued: ids.length, ids })
        }
      } catch (err) {
        console.error('Submit error:', err)
        return NextResponse.json({ error: 'Failed to queue download' }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}

function fetchPlaylistUrls(url: string): (VideoInfo & { url: string })[] {
  const raw = execSync(
    `yt-dlp --dump-json --no-download --no-warnings --yes-playlist --flat-playlist "${url}"`,
    { encoding: 'utf-8', timeout: 120000, env: ENV, maxBuffer: 50 * 1024 * 1024 }
  )

  const lines = raw.trim().split('\n').filter(Boolean)
  return lines.map(line => {
    const info = JSON.parse(line)
    return {
      url: info.webpage_url || info.url || info.original_url || '',
      title: info.title || info.fulltitle || 'Unknown Title',
      channel: info.channel || info.uploader || info.creator || '',
      duration: info.duration || 0,
      thumbnailUrl: info.thumbnail || '',
    }
  })
}
