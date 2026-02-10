import { NextRequest, NextResponse } from 'next/server'
import { getHistory, getHistoryCount, deleteDownload } from '@/lib/db'
import { existsSync } from 'fs'
import { rmSync } from 'fs'

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
    const history = getHistory(limit, offset)
    const total = getHistoryCount()
    return NextResponse.json({ history, total })
  } catch (err) {
    console.error('History error:', err)
    return NextResponse.json({ history: [], total: 0 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, deleteFiles } = await req.json()
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    // Optionally delete the output directory
    if (deleteFiles) {
      const { getDownload } = require('@/lib/db')
      const row = getDownload(id)
      if (row?.output_dir && existsSync(row.output_dir)) {
        rmSync(row.output_dir, { recursive: true, force: true })
      }
    }

    deleteDownload(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
