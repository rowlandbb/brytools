import { NextRequest, NextResponse } from 'next/server'
import { cancelDownload } from '@/lib/downloader'
import { getDownload, updateDownload } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const row = getDownload(id)
    if (!row) {
      return NextResponse.json({ error: 'Download not found' }, { status: 404 })
    }

    if (row.status === 'queued') {
      // Not yet started, just mark as cancelled
      updateDownload(id, { 
        status: 'cancelled', 
        completed_at: new Date().toISOString() 
      })
      return NextResponse.json({ success: true })
    }

    if (row.status === 'downloading' || row.status === 'processing') {
      cancelDownload(id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Download is not active' }, { status: 400 })
  } catch (err) {
    console.error('Cancel error:', err)
    return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  }
}
