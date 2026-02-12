# BRYTOOLS HANDOFF
**Last Updated**: February 12, 2026
**Status**: Phase 1 (Transcribe) + Phase 2 (Dump) + Phase 4 (File Browser) + Phase 5 (Services Dashboard) COMPLETE.

---

## What Is BryTools

Bryan's unified personal toolbox. A single Next.js app with tab-based navigation hosting multiple tools. Three working tabs: **Services** (Mac Mini monitoring dashboard), **Import** (yt-dlp downloads with Full/Text/WAV modes + inline file browser), and **Scribe** (audio/video transcription via Whisper AI).

Design: dark NLE aesthetic inspired by DaVinci Resolve. Outfit font, warm earth gold accent (#b8977a), no rounded corners, museum-quality minimalism. No hot colors (reds, bright blues, etc.) in the UI design.

**Live at**: `http://100.80.21.63:3002` (Mac Mini via Tailscale)
**Default landing page**: `/services` (redirects from `/`)
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

```bash
brytools build       # Compiles Next.js into optimized production files
brytools restart     # Restarts the server to pick up the new build
```

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

## Navigation

Desktop: horizontal tab bar in top header with icons + labels (Services, Import, Scribe).
Mobile (< 640px): fixed bottom tab bar with icons + labels, iOS-native style. Respects safe-area-inset-bottom. Top header tabs hidden, footer hidden.

Tab definitions in `app/tab-nav.tsx`. Adding a new tab: add entry to TABS array with href, label, and lucide icon.

---

## Current Architecture

```
brytools/
├── app/
│   ├── layout.tsx                  ← App shell: BRYTOOLS header + TabNav component
│   ├── tab-nav.tsx                 ← Dual nav: top (desktop) + bottom bar (mobile)
│   ├── page.tsx                    ← Redirects to /services
│   ├── globals.css                 ← Full design system (all CSS variables + components)
│   ├── services/page.tsx           ← Services dashboard (monitoring + controls)
│   ├── transcribe/page.tsx         ← Full transcription UI
│   ├── dump/page.tsx               ← Download UI + inline file browser
│   ├── files/page.tsx              ← Standalone file browser (kept but not in nav)
│   ├── api/services/
│   │   ├── route.ts                ← GET: all service statuses. POST: start/stop/restart/funnel actions
│   │   ├── telemetry/route.ts      ← GET: CPU, RAM, disk, uptime, volumes, machine info
│   │   ├── heartbeat/route.ts      ← GET: network throughput samples (fast mode via ?fast=1)
│   │   ├── speedtest/route.ts      ← POST: runs speedtest-cli, returns down/up/ping
│   │   ├── speedtest/progress/route.ts ← GET: reads speed test progress file
│   │   ├── watchdog/route.ts       ← GET/POST: watchdog config (phone number)
│   │   ├── watchdog/test/route.ts  ← POST: sends test iMessage alert
│   │   └── incidents/route.ts      ← GET: recent watchdog incidents
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
├── scripts/
│   └── speedtest.py                ← Python speed test script (uses speedtest-cli)
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
├── start-server.sh                 ← Server start script
└── brytools.log                    ← Server log output
```

CLI script: `~/bin/brytools`
Watchdog script: `~/.brytools-watchdog/watchdog.sh`

---

## What's Working

### Services Tab (Dashboard)

Real-time monitoring dashboard for all Mac Mini services with branded color identities.

**Three monitored services**, each with unique color identity:
- **BryTools** (gold): The web app itself. Shows network heartbeat EKG, CPU/RAM/storage gauges, uptime, download/transcription stats, machine info, mounted volumes with usage bars.
- **Skinwalker Archive** (green): The Canon Vault app on port 5001. Shows LucidLink mount status alert, document stats, recent activity feed.
- **Ollama** (purple): Local AI inference on port 11434. Shows model count, loaded models, model inventory with sizes.

**Service controls**: Start, stop, restart buttons. Funnel on/off toggle (BryTools only). Log tail viewer per service. Copy-to-clipboard on public Tailscale URL.

**Network Heartbeat EKG**: Live SVG graph in BryTools panel showing download (gold, above baseline) and upload (green, below baseline) throughput. Server-side rolling buffer of 120 samples. Normal polling: 2s. During speed tests: 500ms with server-side fast sampling at 400ms.

**Speed Test**: Button in network header runs speedtest-cli via Python script. Picks best nearby server (Salt Lake City), runs multi-threaded download/upload, reports accurate Mbps results with ping and server info. EKG polling ramps to 500ms during test to show traffic surge on graph.

**Telemetry gauges**: CPU %, RAM (used/total GB), Storage (free space). SVG arc gauges with color thresholds (green < 50%, gold 50-80%, red > 80%).

**Watchdog**: Background script (`watchdog.sh`) runs every 60 seconds via launchd. Monitors all services + LucidLink mount + RowMedia volume. Sends iMessage alerts on failure/recovery with 5-minute cooldown per incident. Dashboard shows config, status badge, and incident timeline.

**Color-coded panels**: Each service's entire expanded panel carries a subtle tint of its brand color (2-3% opacity backgrounds, 10-20% opacity borders) so you can visually identify which app you're scrolling through.

**Mobile responsive**: All panels, gauges, stats, and controls optimized for iPhone. Touch-friendly button sizes, stacked layouts, reduced font sizes.

**launchd auto-restart**: All services have KeepAlive + RunAtLoad plist configs:
- BryTools: `/Library/LaunchAgents/com.bryanrowland.brytools.plist`
- Skinwalker: `~/Library/LaunchAgents/com.bryan.skinwalker-archive.plist`
- Ollama: `~/Library/LaunchAgents/homebrew.mxcl.ollama.plist`
- Watchdog: `~/Library/LaunchAgents/com.bryanrowland.brytools-watchdog.plist`

### Transcribe Tab (Scribe)

- **Upload**: Drag-and-drop or file picker. Supports MP4, MOV, MP3, WAV, M4A, MKV, AVI
- **Ready queue**: Files awaiting transcription with model selector (Turbo/Fast/Balanced/Quality)
- **Start jobs**: Single file or batch start. SSH triggers Mac Studio's batch_transcribe.py
- **Live progress**: Polls progress JSON every 5 seconds. Shows percent, elapsed, ETA, model badge
- **Cancel**: Two-step confirm, writes .cancel marker, cleans up sidecar and progress files
- **Completed**: Click to preview transcript in modal. Copy to clipboard. Download as .txt
- **Delete transcripts**: Two-step confirm delete
- **Storage management**: Collapsible section showing source files in Done/ folder with sizes and delete

### Dump Tab (Import)

- **URL input**: Paste URL, hit Enter or click arrow to submit
- **Playlist detection**: Automatically detects playlists. Shows confirmation dialog with video count, duration preview, and options: "Just this video" or "Download all"
- **Mode selector**: Three modes via segmented control:
  - **Full**: Video (MASTER mp4) + PROXY (1080p transcode) + Subtitles (SRT + cleaned .txt) + Metadata
  - **Text**: Subtitles only, SRT cleaned to plain text for NotebookLM
  - **WAV**: Audio only, converted to 48kHz 16-bit PCM
- **Clean file naming**: Folder = "Video Title [videoID]", files = "Video Title.ext"
- **Live queue**: Polls every 2 seconds. Shows progress percent, speed, ETA, channel, mode badge
- **Post-processing**: Automatic PROXY transcode, SRT cleaning, WAV conversion per mode
- **Concurrent downloads**: Max 2 simultaneous, automatic queue processing
- **Cancel**: Two-step confirm on active and queued downloads
- **Completed history with inline file browser**: Expand to browse files, preview video/text, per-file delete

---

## Network & Machines

| Machine | Tailscale IP | Role |
|---------|-------------|------|
| Mac Mini M2 Pro (32GB) | 100.80.21.63 | BryTools web server (port 3002), always-on server |
| Mac Studio M3 Ultra (256GB) | 100.100.179.121 | Whisper AI transcription (batch_transcribe.py) |
| MacBook Pro M3 Max (64GB) | 100.71.16.41 | Bryan's laptop |

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
| Watchdog config + incidents | `~/.brytools-watchdog/` |
| Speed test script | `scripts/speedtest.py` (in project root) |

---

## Dependencies

```bash
# Mac Mini (Homebrew)
brew install yt-dlp ffmpeg node

# Python (for speed test)
pip3 install speedtest-cli --user --break-system-packages
# Installed at: /Users/bryanrowland/Library/Python/3.14/bin/speedtest-cli
```

---

## Design System Quick Reference

### CSS Variables
```
--bg: #090909          --accent: #b8977a
--surface: #0f0f0f     --accent-dim: #8a7460
--raised: #141414      --accent-bg: rgba(184,151,122,0.06)
--border: #1a1a1a      --green: #6b8f72
--border-hi: #252525   --red: #9b5a5a
--text: #c8c2b8        --text-hi: #ebe7e0
--text-dim: #6b6560    --text-muted: #3d3a36
--purple: #a78bfa
```

### Service Brand Colors
- **BryTools**: Gold (`var(--accent)`, `rgba(196, 160, 105, ...)`)
- **Skinwalker Archive**: Green (`var(--green)`, `rgba(107, 143, 114, ...)`)
- **Ollama**: Purple (`var(--purple)`, `rgba(167, 139, 250, ...)`)

### UI Direction
Muted earth tones only. No hot colors in UI design. The only red is for destructive action confirms, kept minimal. Service panels use subtle brand-colored tinting (2-3% opacity) for visual identity.

---

## Adding Future Tabs

1. Create `app/newtool/page.tsx`
2. Create `app/api/newtool/` routes
3. Add tab to TABS array in `app/tab-nav.tsx` (href, label, lucide icon)
4. Add CSS to `globals.css` if needed
5. `brytools build && brytools restart`

Bottom nav bar scales to 5-6 tabs comfortably on mobile.
