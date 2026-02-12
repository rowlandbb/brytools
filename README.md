# BryTools

A personal command center for managing media workflows, server infrastructure, and AI tools. Built as a single Next.js app running 24/7 on a Mac Mini, accessed from anywhere via Tailscale.

## What It Does

**Services** monitors the Mac Mini in real time. CPU, RAM, and storage gauges. A network heartbeat EKG showing live upload/download throughput. Internet speed tests. Service health for BryTools, Skinwalker Archive, and Ollama with start/stop/restart controls, Tailscale Funnel toggling, and log viewers. A watchdog sends iMessage alerts when anything goes down.

**Import** downloads video, audio, and subtitles from YouTube and other platforms via yt-dlp. Three modes: Full (master + proxy + subs + metadata), Text (subtitles cleaned to plain text for NotebookLM), and WAV (48kHz 16-bit PCM). Playlist detection, concurrent downloads, post-processing, and an inline file browser with video preview.

**Scribe** transcribes audio and video using Whisper AI running on a Mac Studio. Upload files, pick a model preset, and monitor progress. Transcripts are viewable, copyable, and downloadable.

## Stack

Next.js 16 , React 19, TypeScript, SQLite (better-sqlite3), lucide-react icons. No CSS framework. Hand-written design system with Outfit font, dark NLE aesthetic, and warm earth tones.

## Setup

Runs on macOS with Node.js, Homebrew, and Tailscale.

```bash
npm install
npm run build
npm run start          # http://localhost:3002
```

A CLI wrapper at `~/bin/brytools` handles start/stop/restart/build/public/private/logs/status.

## Architecture

See [HANDOFF.md](HANDOFF.md) for full technical documentation including file structure, API routes, data directories, network topology, and design system reference.

## Machines

| Machine | Role |
|---------|------|
| Mac Mini M2 Pro 32GB | Always-on server. Runs BryTools, Skinwalker Archive, Ollama, Plex. |
| Mac Studio M3 Ultra 256GB | Whisper AI transcription via SSH. |
| MacBook Pro M3 Max 64GB | Development and daily driver. |

All connected via Tailscale. Public access available through Tailscale Funnel when enabled.
