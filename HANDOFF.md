# BRYTOOLS HANDOFF
**Last Updated**: February 16, 2026
**Status**: Phase 1 (Transcribe) + Phase 2 (Import/Dump) + Phase 4 (File Browser) + Phase 5 (Services Dashboard) + Phase 6 (Mac Studio Remote Monitoring) + Power Monitoring COMPLETE.

---

## What Is BryTools

Bryan's unified personal toolbox. A single Next.js app with tab-based navigation hosting multiple tools. Three working tabs: **Services** (dual-machine monitoring dashboard), **Import** (yt-dlp downloads with Full/Text/WAV modes + inline file browser), and **Scribe** (audio/video transcription via Whisper AI).

Design: dark NLE aesthetic inspired by DaVinci Resolve. Outfit font, warm earth gold accent (#b8977a), no rounded corners, museum-quality minimalism. No hot colors (reds, bright blues, etc.) in the UI design.

**Live at**: `http://100.80.21.63:3002` (Mac Mini via Tailscale)
**Default landing page**: `/services` (redirects from `/`)
**Repo**: `github.com/rowlandbb/brytools` (private)

---

## Services Dashboard Architecture

The Services tab has two sub-tabs: **Mac Mini** and **Mac Studio**. Both follow the same top-down layout pattern for visual consistency.

### Mac Mini Tab
Top-level system telemetry rendered directly (no service block wrapper):
1. **Network Heartbeat EKG** -- shared component (`heartbeat.tsx`) showing live download/upload throughput with SVG waveform and integrated speed test
2. **Five gauges** -- CPU, GPU, RAM, Storage, Power (5-col desktop, 2-col mobile)
3. **Machine bar** -- Mac Mini M2 Pro specs
4. **Uptime bar** -- system uptime + load averages
5. **Stats grid** -- Downloads count, Transcripts count, Dump folder size
6. **Mounted Volumes** -- RowMedia and other external volumes with usage bars

Below system telemetry, a **Services** section with collapsible panels:
- **Skinwalker Archive** -- canon entries, source files, request counts, memory usage, recent activity, log tail

### Mac Studio Tab

Top-level system telemetry (same pattern as Mini):
1. **Network Heartbeat EKG** -- same shared component
2. **GPU Activity Graph** -- rolling SVG line chart of GPU Device Utilization %
3. **Five gauges** -- CPU, GPU, RAM, Storage, Power (5-col desktop, 2-col mobile)
4. **Machine bar** -- Mac Studio M3 Ultra specs
5. **Uptime bar** -- system uptime + load averages

### Shared Components

- `heartbeat.tsx` -- Network EKG + Speed Test, imported by both tabs
- `Gauge` component -- SVG arc gauge, defined in `page.tsx`
- `Stat` component -- icon + value + label + subtitle grid cell
- `LogTail` component -- collapsible log viewer per service

---

## Project Location

```
/Users/bryanrowland/Documents/Vibe/brytools/
```

---

## Fresh Install (New Mac)

```bash
git clone git@github.com:rowlandbb/brytools.git ~/Documents/Vibe/brytools
cd ~/Documents/Vibe/brytools
./setup.sh
brytools start
```

`setup.sh` is idempotent and handles everything: Homebrew, Node.js, yt-dlp, ffmpeg, speedtest-cli, npm install, production build, the `brytools` CLI (with auto-detected Tailscale IP), PATH config, and launchd plist generation. Safe to re-run anytime (skips what's already installed).

**Manual steps after setup:**
1. Install and log into [Tailscale](https://tailscale.com/download/mac), then re-run `./setup.sh` to stamp the IP into the CLI
2. Mount external volumes (`ME Backup02` for transcription and dump storage)
3. Set up SSH key for Mac Studio (`ssh-copy-id bryan@100.100.179.121`) if Scribe tab is needed
4. Enable passwordless `powermetrics` for the Power gauge on each machine:
   - Mac Mini: `echo "bryanrowland ALL=(ALL) NOPASSWD: /usr/bin/powermetrics" | sudo tee /etc/sudoers.d/powermetrics`
   - Mac Studio: `echo "bryan ALL=(ALL) NOPASSWD: /usr/bin/powermetrics" | sudo tee /etc/sudoers.d/powermetrics`

---

## CLI Quick Reference

The `brytools` command lives at `~/bin/brytools` and is in PATH.

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

---

## Navigation

Desktop: horizontal tab bar in top header with icons + labels (Services, Import, Scribe).
Mobile (< 640px): fixed bottom tab bar with icons + labels, iOS-native style. Respects safe-area-inset-bottom. Top header tabs hidden, footer hidden.

Tab definitions in `app/tab-nav.tsx`. Adding a new tab: add entry to TABS array with href, label, and lucide icon.

---

## File Structure

```
brytools/
├── app/
│   ├── layout.tsx                  # App shell: BRYTOOLS header + TabNav
│   ├── tab-nav.tsx                 # Dual nav: top (desktop) + bottom bar (mobile)
│   ├── page.tsx                    # Redirects to /services
│   ├── globals.css                 # Full design system (all CSS variables + components)
│   ├── services/
│   │   ├── page.tsx                # Services dashboard: Mac Mini tab + tab switcher
│   │   ├── mac-studio-tab.tsx      # Mac Studio monitoring tab
│   │   └── heartbeat.tsx           # Shared Network EKG + Speed Test component
│   ├── transcribe/page.tsx         # Transcription UI
│   ├── dump/page.tsx               # Download UI + inline file browser
│   ├── files/page.tsx              # Standalone file browser (not in nav)
│   ├── api/services/
│   │   ├── route.ts                # GET: service statuses. POST: start/stop/restart/funnel
│   │   ├── logs/route.ts           # GET: per-service telemetry + logs (includes GPU)
│   │   ├── studio/route.ts         # GET: Mac Studio telemetry via SSH
│   │   ├── heartbeat/route.ts      # GET: network throughput samples
│   │   ├── speedtest/route.ts      # POST: runs speedtest-cli
│   │   ├── speedtest/progress/     # GET: speed test progress
│   ├── api/transcribe/             # Transcription endpoints
│   ├── api/dump/                   # Download endpoints
│   └── api/files/                  # File browser endpoints
├── scripts/
│   └── speedtest.py                # Python speed test script
├── lib/
│   ├── db.ts                       # SQLite wrapper for download history
│   ├── downloader.ts               # yt-dlp process spawner + queue manager
│   └── srt-cleaner.ts              # SRT to clean text converter
├── studio/
│   ├── batch_transcribe.py         # Whisper AI processing (runs on Mac Studio)
│   └── deploy.sh                   # SCP deploy script
├── public/                         # Static assets
├── package.json                    # Next.js 16.1.6, React 19, lucide-react, better-sqlite3
├── next.config.mjs                 # Must be .mjs for external volume compatibility
├── start-server.sh                 # Server start script (not used by launchd)
└── com.bryanrowland.brytools.plist # LaunchAgent definition (canonical copy)
```

**Log location**: `/Users/bryanrowland/Documents/Vibe/swu-scripts/logs/brytools.log`
(Logs are stored outside the project directory -- see LaunchAgent section below for why.)

---

## Network & Machines

| Machine | Tailscale IP | Role |
|---------|-------------|------|
| Mac Mini M2 Pro (32GB) | 100.80.21.63 | BryTools server (port 3002), always-on |
| Mac Studio M3 Ultra (256GB) | 100.100.179.121 | Whisper transcription |
| MacBook Pro M3 Max (64GB) | 100.71.16.41 | Bryan's laptop |

---

## Data Directories

| Purpose | Path |
|---------|------|
| Transcribe uploads | `/Volumes/ME Backup02/BryTranscribe/` |
| Transcribe processed | `/Volumes/ME Backup02/BryTranscribe/Done/` |
| Transcribe output | `/Volumes/ME Backup02/BryTranscribe/transcriptions/` |
| Transcribe progress | `/Volumes/ME Backup02/BryTranscribe/progress/` |
| Dump downloads | `/Volumes/ME Backup02/_Dump/` |
| Dump history DB | `/Volumes/ME Backup02/_Dump/brytools.db` |
| Speed test script | `scripts/speedtest.py` |

---

## LaunchAgent (`com.bryan.brytools-app`)

BryTools runs as a launchd LaunchAgent with `KeepAlive: true` and `RunAtLoad: true`. The plist is at `~/Library/LaunchAgents/com.bryanrowland.brytools.plist`. A canonical copy lives in the project root.

**How it starts**: `node node_modules/next/dist/bin/next start -p 3002` (direct node invocation, not bash). macOS sandbox restrictions block bash scripts launched by LaunchAgent with "Operation not permitted".

**Log path**: `~/Documents/Vibe/swu-scripts/logs/brytools.log` (NOT inside the project directory).

### com.apple.provenance (Critical)

The brytools project directory has the `com.apple.provenance` extended attribute. This is set by macOS when files are created by sandboxed apps (Cursor, VS Code, sandboxed git clients). It cannot be removed -- it's immutable on modern macOS.

When launchd's `xpcproxy` tries to open a file inside a provenance-tagged directory, macOS System Policy blocks it with `deny(1) file-read-data`, causing exit code 78 (EX_CONFIG) and a crash loop. This is why the log path MUST be outside the project directory.

If brytools starts crash-looping with exit code 78 and an empty log, check:
```bash
# Is the log path inside a provenance-tagged directory?
xattr /path/to/log/directory
# If it shows com.apple.provenance, move the log path elsewhere

# Check system log for the actual denial
/bin/bash -c 'log show --predicate "composedMessage CONTAINS \"brytools\" AND composedMessage CONTAINS \"deny\"" --last 5m'
```

The skinwalker project avoids this by writing logs to `swu-scripts/logs/` which was created by a non-sandboxed process and has no provenance.

### Database on External Volume

The SQLite database lives at `/Volumes/ME Backup02/_Dump/brytools.db`. If the volume is unmounted, `lib/db.ts` handles this gracefully -- all database functions return empty results instead of crashing. The database reconnects automatically after 60 seconds.

---

## Design System

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
- **BryTools / Mac Mini**: Gold (`var(--accent)`, `rgba(196, 160, 105, ...)`)
- **Skinwalker Archive**: Green (`var(--green)`, `rgba(107, 143, 114, ...)`)

### Mobile Responsive
All components adapt at the 640px breakpoint:
- Gauges: 4-col to 2-col
- Stat grids: 3-col to 2-col
- Service headers: stack vertically
- Volumes: full-width stacking
- Navigation: top tabs to bottom bar
- GPU graph: reduced height
- Uptime bar: wrapping + smaller text

### Key Rules
- Muted earth tones only. No hot colors in UI.
- Red only for destructive action confirms, minimal.
- Brand tinting at 2-3% opacity for visual identity.
- No rounded corners. Museum-quality minimalism.
- No em dashes in any text content.
