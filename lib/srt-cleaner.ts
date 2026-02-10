import { readFileSync } from 'fs'

/**
 * SRT Cleaner - converts SRT subtitle files to clean readable text
 * Port of Python srt_cleaner.py to TypeScript
 */

interface SubEntry {
  timestamp: string
  text: string
}

export function cleanSrt(srtContent: string, sourceUrl?: string): string {
  const entries = parseSrt(srtContent)
  const deduped = deduplicateRolling(entries)
  
  const lines: string[] = []
  
  if (sourceUrl) {
    lines.push(`Source: ${sourceUrl}`)
    lines.push('')
  }
  
  for (const entry of deduped) {
    lines.push(`[${entry.timestamp}] ${entry.text}`)
  }
  
  return lines.join('\n')
}

function parseSrt(content: string): SubEntry[] {
  const entries: SubEntry[] = []
  const blocks = content.trim().split(/\n\s*\n/)
  
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue
    
    // Line 1: index number (skip)
    // Line 2: timestamp
    // Line 3+: text
    const timeLine = lines[1]
    const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2})/)
    if (!match) continue
    
    const timestamp = `${match[1]}:${match[2]}:${match[3]}`
    const text = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim()
    
    if (text) {
      entries.push({ timestamp, text })
    }
  }
  
  return entries
}

function deduplicateRolling(entries: SubEntry[]): SubEntry[] {
  if (entries.length === 0) return []
  
  const result: SubEntry[] = []
  let lastText = ''
  
  for (const entry of entries) {
    const cleaned = entry.text.toLowerCase().trim()
    
    // Skip if identical to last entry
    if (cleaned === lastText) continue
    
    // Skip if this text is a substring of the previous (rolling captions)
    if (lastText && cleaned.startsWith(lastText)) {
      // Replace the last entry with this longer version
      result[result.length - 1] = entry
      lastText = cleaned
      continue
    }
    
    // Skip if previous text is a substring of this one (reverse rolling)
    if (lastText && lastText.startsWith(cleaned)) continue
    
    result.push(entry)
    lastText = cleaned
  }
  
  return result
}

export function cleanSrtFile(srtPath: string, sourceUrl?: string): string {
  const content = readFileSync(srtPath, 'utf-8')
  return cleanSrt(content, sourceUrl)
}
