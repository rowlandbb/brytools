# BRYTOOLS HANDOFF
**Last Updated**: February 10, 2026
**Status**: Phase 1 + Phase 2 + Phase 4 (File Browser) COMPLETE.

---

## What Is BryTools

Bryan's unified personal toolbox. A single Next.js app with tab-based navigation hosting multiple tools. Two working tabs: **Transcribe** (audio/video transcription via Whisper AI) and **Dump** (yt-dlp downloads with Full/Text/WAV modes + inline file browser).

Design: dark NLE aesthetic inspired by DaVinci Resolve. Outfit font, warm earth gold accent (#b8977a), no rounded corners, museum-quality minimalism. No hot colors (reds, bright blues, etc.) in the UI design.

**Live at**: `http://100.80.21.63:3002` (Mac Mini via Tailscale)
**Repo**: `github.com/rowlandbb/brytools` (private)

---

## Project Location

```
/Volumes/RowMedia/CODE/brytools/
```

---

## CLI Quick Reference

The `brytools` command lives at `~/bin/brytools` and is in PATH. Type `brytools` with no arguments to see help.

```bash
brytools start       # Start the production server (port 3002)
brytools stop        # Stop the server
brytools restart     # Stop + start
brytools status      # Show PID, local URL, and Tailscale status
brytools build       # Compile the app for production (required after code changes)
brytools public      # Enable public internet access via Tailscale Funnel (port 10443)
brytools private     # Disable public access (tailnet-only)
brytools logs        # Tail the log file
```

### After Making Code Changes

Any time the source code is modified, the changes won't take effect until you build and restart:

```bash
brytools build       # Compiles Next.js into optimized production files
brytools restart     # Restarts the server to pick up the new build
```

Think of `brytools build` like rendering/exporting a timeline. You edit in dev mode, then build to create the optimized production output. Without building, the server keeps running the old compiled version.

### Public Access (Tailscale Funnel)

```bash
brytools public      # Anyone on the internet can access via:
                     # https://bryans-mac-mini.tail11a1a1.ts.net:10443

brytools private     # Turns off public access, still available on tailnet at:
                     # http://100.80.21.63:3002
```

### Deploy Whisper Script to Mac Studio

```bash
cd /Volumes/RowMedia/CODE/brytools/studio
./deploy.sh
```

---

## Current Architecture

```
brytools/
├── app/
│   ├── layout.tsx                  ← App shell: BRYTOOLS header + TabNav component
│   ├── tab-nav.tsx                 ← Client component, usePathname() for active tab
│   ├── page.tsx                    ← Redirects to /transcribe
│   ├── globals.css                 ← Full design system (all CSS variables + components)
│   ├── favicon.ico
│   ├── transcribe/page.tsx         ← Full transcription UI
│   ├── dump/page.tsx               ← Download UI + inline file browser
│   ├── files/page.tsx              ← Standalone file browser (kept but not in nav)
│   ├── api/transcribe/
│   │   ├── files/route.ts          ← Lists ready/processing/completed files
│   │   ├── upload/route.ts         ← Handles file uploads via FormData
│   │   ├── start/route.ts          ← Writes .model sidecar + SSH triggers Mac Studio
│   │   ├── progress/route.ts       ← Reads progress JSON from shared volume
│   │   ├── cancel/route.ts         ← Writes .cancel marker, moves file to Done/
│   │   ├── preview/route.ts        ← Returns transcript content as JSON
│   │   ├── download/route.ts       ← Returns transcript as downloadable attachment
│   │   ├── delete/route.ts         ← Deletes transcript file
│   │   └── storage/route.ts        ← Lists/deletes source files in Done/ folder
│   ├── api/dump/
│   │   ├── submit/route.ts         ← POST: check URL for playlist + queue download
│   │   ├── queue/route.ts          ← GET: active/queued downloads with progress
│   │   ├── history/route.ts        ← GET/DELETE: completed download history
│   │   └── cancel/route.ts         ← POST: cancel active or queued download
│   └── api/files/
│       ├── list/route.ts           ← GET: scan _Dump/ for all folders with metadata
│       ├── detail/route.ts         ← GET: list files in folder. DELETE: file or folder
│       └── serve/route.ts          ← GET: serve files (video streaming, images, text)
├── lib/
│   ├── db.ts                       ← SQLite wrapper (better-sqlite3) for download history
│   ├── downloader.ts               ← yt-dlp process spawner, progress parsing, queue manager
│   └── srt-cleaner.ts              ← SRT subtitle to clean text converter
├── studio/
│   ├── batch_transcribe.py         ← Runs on Mac Studio (Whisper AI processing)
│   └── deploy.sh                   ← SCP script to deploy batch_transcribe.py
├── public/                         ← Static assets
├── package.json                    ← Next.js 16.1.6, React 19, lucide-react, better-sqlite3
├── next.config.mjs                 ← MUST be .mjs (not .ts) for external volume compatibility
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
├── .gitignore
├── start-server.sh                 ← Server start script
└── brytools.log                    ← Server log output
```

CLI script: `~/bin/brytools`

---

## What's Working

### Transcribe Tab

- **Upload**: Drag-and-drop or file picker. Supports MP4, MOV, MP3, WAV, M4A, MKV, AVI
- **Ready queue**: Files awaiting transcription with model selector (Turbo/Fast/Balanced/Quality)
- **Start jobs**: Single file or batch start. SSH triggers Mac Studio's batch_transcribe.py
- **Live progress**: Polls progress JSON every 5 seconds. Shows percent, elapsed, ETA, model badge
- **Cancel**: Two-step confirm, writes .cancel marker, cleans up sidecar and progress files
- **Completed**: Click to preview transcript in modal. Copy to clipboard. Download as .txt
- **Delete transcripts**: Two-step confirm delete
- **Storage management**: Collapsible section showing source files in Done/ folder with sizes and delete

### Dump Tab

- **URL input**: Paste URL, hit Enter or click arrow to submit
- **Playlist detection**: Automatically detects playlists. Shows confirmation dialog with video count, duration preview, and options: "Just this video" or "Download all"
- **Mode selector**: Three modes via segmented control:
  - **Full**: Video (MASTER mp4) + PROXY (1080p transcode) + Subtitles (SRT + cleaned .txt) + Metadata
  - **Text**: Subtitles only, SRT cleaned to plain text for NotebookLM
  - **WAV**: Audio only, converted to 48kHz 16-bit PCM
- **Clean file naming**: Folder = "Video Title [videoID]", files = "Video Title.ext" with "_proxy" suffix. Title truncated at 70 chars on word boundary. Platform/date/channel metadata stored in info.json inside folder. Files are immediately identifiable in DaVinci Resolve media pool.
- **Live queue**: Polls every 2 seconds. Shows progress percent, speed, ETA, channel, mode badge
- **Post-processing**: Automatic after download completes:
  - Full mode: ffmpeg PROXY transcode + SRT cleaning
  - Text mode: SRT to clean .txt conversion
  - WAV mode: ffmpeg sample rate conversion to 48kHz/16-bit
- **Concurrent downloads**: Max 2 simultaneous, automatic queue processing
- **Cancel**: Two-step confirm on active and queued downloads
- **Completed history with inline file browser**:
  - Click any completed download to expand and see folder contents
  - Video preview: plays PROXY by default (falls back to MASTER), with thumbnail poster
  - Text/SRT preview: click to open in modal with copy-to-clipboard
  - Per-file delete: remove individual files (e.g. nuke MASTER, keep PROXY) with two-step confirm
  - Folder delete: remove entire download folder with two-step confirm
  - Auto-cleanup: if last real file is deleted, folder is removed automatically
- **Supported platforms**: YouTube, Twitter/X, and most sites yt-dlp supports

---

## Network & Machines

| Machine | Tailscale IP | Role |
|---------|-------------|------|
| Mac Mini | 100.80.21.63 | BryTools web server (port 3002), yt-dlp host |
| Mac Studio | 100.100.179.121 | Whisper AI transcription (batch_transcribe.py) |

---

## Data Directories

| Purpose | Path |
|---------|------|
| Transcribe uploads (landing zone) | `/Volumes/ME Backup02/BryTranscribe/` |
| Transcribe processed source files | `/Volumes/ME Backup02/BryTranscribe/Done/` |
| Transcribe output transcripts | `/Volumes/ME Backup02/BryTranscribe/transcriptions/` |
| Transcribe progress JSON files | `/Volumes/ME Backup02/BryTranscribe/progress/` |
| Dump downloads | `/Volumes/ME Backup02/_Dump/` |
| Dump history database | `/Volumes/ME Backup02/_Dump/brytools.db` |

---

## How Transcription Works

1. User uploads media file to `/Volumes/ME Backup02/BryTranscribe/`
2. User selects model preset and clicks Start
3. API writes `filename.model` sidecar JSON with preset info
4. API runs SSH command to Mac Studio: triggers `batch_transcribe.py` if not already running
5. Mac Studio's script reads the shared volume, picks up files with `.model` sidecars
6. Script writes progress JSON to `progress/` folder (polled by frontend every 5s)
7. On completion, transcript lands in `transcriptions/`, source moves to `Done/`
8. Frontend detects completed status on next poll, shows in Completed section

---

## How Dump Downloads Work

1. User pastes a URL and selects a mode (Full/Text/WAV)
2. `POST /api/dump/submit` with `action: 'check'` probes URL via `yt-dlp --dump-json --flat-playlist`
3. If playlist detected, returns count + preview for user confirmation
4. On confirm (or single video), `action: 'submit'` inserts into SQLite as "queued"
5. Queue processor checks for available slots (max 2 concurrent), spawns `yt-dlp` as a child process
6. Progress is parsed from yt-dlp stdout via regex and written to SQLite in real-time
7. Frontend polls `GET /api/dump/queue` every 2 seconds for live progress
8. On yt-dlp completion, post-processing runs (PROXY transcode, SRT cleaning, WAV conversion depending on mode)
9. info.json written with title, channel, URL, duration, mode, timestamp
10. Final status and file size written to SQLite, job moves to completed history
11. Output lands in `/Volumes/ME Backup02/_Dump/Video Title [videoID]/`

### File Naming Convention

```
_Dump/
  Video Title [h9385x9HBZc]/
    Video Title.mp4                    ← MASTER (original quality)
    Video Title_proxy.mp4              ← PROXY (1080p, fast transcode)
    Video Title.en.srt                 ← Subtitles
    Video Title.en.txt                 ← Cleaned transcript
    Video Title.webp                   ← Thumbnail
    Video Title.description            ← Video description
    info.json                          ← Metadata (channel, date, URL, etc.)
```

Title is first in every filename so it's identifiable in DaVinci Resolve media pool. Video ID in folder brackets keeps things unique. Platform/date/channel live in info.json, not the filename.

### yt-dlp Dependencies (installed on Mac Mini via Homebrew)

```bash
brew install yt-dlp ffmpeg
```

---

## File Browser API

The file browser APIs serve the inline file browser in the Dump tab and the standalone /files page.

- `GET /api/files/list` - Scans _Dump/ directory, returns folder metadata (title from info.json or folder name, channel, mode detection, file count, total size, thumbnail). Supports `?q=` search.
- `GET /api/files/detail?folder=NAME` - Lists files in a specific folder with type classification (video/audio/subtitle/text/image/data), proxy detection, size. Returns recommended preview video (proxy preferred) and thumbnail.
- `DELETE /api/files/detail` - Body: `{folder, file?}`. Deletes a specific file or entire folder. Auto-removes folder if only info.json remains after file delete.
- `GET /api/files/serve?folder=NAME&file=NAME` - Serves files with proper MIME types. Supports HTTP Range requests for video streaming. Path traversal protected.

---

## Design System Quick Reference

### CSS Variables
```
--bg: #090909          --accent: #b8977a
--surface: #0f0f0f     --accent-dim: #8a7460
--raised: #141414      --accent-bg: rgba(184,151,122,0.06)
--border: #1a1a1a      --green: #6b8f72
--border-hi: #252525   --red: #9b5a5a
--border-light: #1f1f1f
--text: #c8c2b8        --text-hi: #ebe7e0
--text-dim: #6b6560    --text-muted: #3d3a36
```

### UI Direction
Muted earth tones only. No hot colors (red, bright blue, neon) in the UI design. The only red is for destructive action confirms, kept minimal.

### Reusable Component Patterns (CSS classes)
- **Section**: `.section` + `.section-label` + `.section-count`
- **Card**: `.card` (border container for rows)
- **Row**: `.row` > `.row-info` (`.row-icon` + `.row-text` > `.row-name` + `.row-detail`) + `.row-actions`
- **Expandable row**: `.row--clickable` + `.row--expanded` + `.dump-expanded` (inline file browser)
- **Progress**: `.processing-progress-track` + `.processing-progress-fill`
- **Badges**: `.row-badge` (inline), `.files-badge` (standalone)
- **Segmented selector**: `.model-options` + `.model-option` + `.model-option--active`
- **Confirm pattern**: `.confirm-group` > `.btn-confirm-delete` + `.btn-cancel`
- **Modal**: `.preview-overlay` + `.preview-panel` + `.preview-header` + `.preview-body`
- **URL input**: `.dump-input-section` + `.dump-url-input` + `.dump-go-btn`
- **File browser**: `.folder-row`, `.file-row`, `.files-video-preview`, `.files-btn-sm`
- **Playlist dialog**: `.playlist-panel` + `.playlist-actions`

---

## Build & Dev Commands

```bash
cd /Volumes/RowMedia/CODE/brytools

# Development (hot reload, not optimized)
npm run dev                    # Starts dev server on port 3002

# Production build + start (what brytools CLI uses)
npm run build                  # Compiles to .next/ folder
npm run start                  # Starts production server on port 3002

# Important: next.config.mjs MUST stay as .mjs (not .ts)
# Important: build command in package.json uses full path to avoid external volume issues
```

---

## Adding Future Tabs

1. Create `app/newtool/page.tsx`
2. Create `app/api/newtool/` routes
3. Add tab to `app/tab-nav.tsx` nav array
4. Add CSS to `globals.css` if needed
5. `brytools build && brytools restart`
