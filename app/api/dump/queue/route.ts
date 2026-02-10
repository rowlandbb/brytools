import { NextResponse } from 'next/server'
import { getQueue } from '@/lib/db'

export async function GET() {
  try {
    const queue = getQueue()
    return NextResponse.json({ queue })
  } catch (err) {
    console.error('Queue error:', err)
    return NextResponse.json({ queue: [] })
  }
}
