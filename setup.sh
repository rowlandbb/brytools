#!/bin/bash
# ─────────────────────────────────────────────────────────────
# BryTools Setup
# Run after cloning the repo on a fresh Mac.
# Usage: cd ~/Documents/Vibe/brytools && ./setup.sh
# ─────────────────────────────────────────────────────────────

set -e

red()   { printf "\033[0;31m%s\033[0m\n" "$1"; }
green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
dim()   { printf "\033[0;90m%s\033[0m\n" "$1"; }
gold()  { printf "\033[0;33m%s\033[0m\n" "$1"; }

PROJECT="$(cd "$(dirname "$0")" && pwd)"
BREW="/opt/homebrew/bin/brew"

echo ""
gold "═══════════════════════════════════════"
gold "  BryTools Setup"
gold "═══════════════════════════════════════"
echo ""
echo "  Project: $PROJECT"
echo ""

# ── Homebrew ─────────────────────────────
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
green "✓ Homebrew"

# ── Node.js ──────────────────────────────
if ! command -v node &>/dev/null; then
  echo "Installing Node.js..."
  brew install node
fi
green "✓ Node.js $(node -v)"

# ── yt-dlp ───────────────────────────────
if ! command -v yt-dlp &>/dev/null; then
  echo "Installing yt-dlp..."
  brew install yt-dlp
fi
green "✓ yt-dlp"

# ── ffmpeg ───────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "Installing ffmpeg..."
  brew install ffmpeg
fi
green "✓ ffmpeg"

# ── speedtest-cli ────────────────────────
if ! pip3 show speedtest-cli &>/dev/null 2>&1; then
  echo "Installing speedtest-cli..."
  pip3 install speedtest-cli --break-system-packages 2>/dev/null || pip3 install speedtest-cli
fi
green "✓ speedtest-cli"


# ── npm install ──────────────────────────
echo "Installing Node dependencies..."
cd "$PROJECT"
npm install --silent
green "✓ npm packages"

# ── Production build ─────────────────────
echo "Building for production..."
npx next build
green "✓ Production build"

# ── ~/bin directory ──────────────────────
mkdir -p ~/bin

# ── Detect machine identity ─────────────
HOSTNAME=$(scutil --get LocalHostName 2>/dev/null || hostname -s)
echo ""
gold "Machine: $HOSTNAME"


# ── Get Tailscale IP ─────────────────────
TS_IP=""
if command -v /Applications/Tailscale.app/Contents/MacOS/Tailscale &>/dev/null; then
  TS_IP=$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4 2>/dev/null || true)
fi
if [ -z "$TS_IP" ] && command -v tailscale &>/dev/null; then
  TS_IP=$(tailscale ip -4 2>/dev/null || true)
fi

if [ -z "$TS_IP" ]; then
  gold "⚠ Tailscale not detected. Install Tailscale, then re-run setup."
  gold "  The CLI will use 'localhost' until Tailscale is configured."
  TS_IP="localhost"
fi
green "✓ Tailscale IP: $TS_IP"

# ── Install brytools CLI ─────────────────
CLI="$HOME/bin/brytools"
cat > "$CLI" << 'CLIEOF'
#!/bin/bash
# ─────────────────────────────────────────
# brytools - BryTools server + Tailscale manager
# ─────────────────────────────────────────

PROJECT="__PROJECT__"
LOG="$PROJECT/brytools.log"
PORT=3002
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
TS_PORT=10443
IP="__IP__"

red()   { printf "\033[0;31m%s\033[0m\n" "$1"; }
green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
dim()   { printf "\033[0;90m%s\033[0m\n" "$1"; }
gold()  { printf "\033[0;33m%s\033[0m\n" "$1"; }

get_pid() { lsof -ti:$PORT 2>/dev/null | head -1; }

case "$1" in

  start)
    if [ -n "$(get_pid)" ]; then
      green "Already running (PID $(get_pid))"
      echo "  http://$IP:$PORT"
      exit 0
    fi
    echo "Starting BryTools..."
    cd "$PROJECT"
    nohup /opt/homebrew/bin/node node_modules/.bin/next start -p $PORT >> "$LOG" 2>&1 &
    disown
    sleep 3
    PID=$(get_pid)
    if [ -n "$PID" ]; then
      green "BryTools running (PID $PID)"
      echo "  http://$IP:$PORT"
    else
      red "Failed to start. Check: brytools logs"
    fi
    ;;

  stop)
    PID=$(get_pid)
    if [ -n "$PID" ]; then
      kill "$PID" 2>/dev/null
      sleep 1
      [ -n "$(get_pid)" ] && kill -9 "$(get_pid)" 2>/dev/null
      green "Stopped"
    else
      dim "Not running"
    fi
    ;;

  restart)
    $0 stop
    sleep 1
    $0 start
    ;;

  status)
    PID=$(get_pid)
    if [ -n "$PID" ]; then
      green "BryTools running (PID $PID)"
      echo "  Local:   http://$IP:$PORT"
      FUNNEL=$($TS funnel status 2>/dev/null | grep ":$TS_PORT")
      if [ -n "$FUNNEL" ]; then
        if echo "$FUNNEL" | grep -q "Funnel on"; then
          gold "  Public:  https://$(hostname).tail11a1a1.ts.net:$TS_PORT"
        else
          echo "  Tailnet: https://$(hostname).tail11a1a1.ts.net:$TS_PORT"
        fi
      else
        dim "  Tailscale: not configured"
      fi
    else
      dim "Not running"
    fi
    ;;

  build)
    echo "Building..."
    cd "$PROJECT"
    node node_modules/.bin/next build 2>&1
    if [ $? -eq 0 ]; then
      green "Build complete"
      dim "Run 'brytools restart' to apply"
    else
      red "Build failed"
    fi
    ;;

  public)
    echo "Enabling public access via Tailscale Funnel..."
    $TS serve --bg --https=$TS_PORT http://localhost:$PORT 2>/dev/null
    $TS funnel --bg $TS_PORT on 2>/dev/null
    if [ $? -eq 0 ]; then
      green "Public access ON"
      gold "  https://$(hostname).tail11a1a1.ts.net:$TS_PORT"
    else
      red "Failed. Is Tailscale running?"
    fi
    ;;

  private)
    echo "Disabling public access..."
    $TS funnel $TS_PORT off 2>/dev/null
    $TS serve --https=$TS_PORT off 2>/dev/null
    green "Public access OFF"
    dim "Still available on tailnet: http://$IP:$PORT"
    ;;

  logs)
    if [ -f "$LOG" ]; then
      tail -f "$LOG"
    else
      dim "No log file yet"
    fi
    ;;

  *)
    echo "brytools - BryTools server manager"
    echo ""
    echo "  brytools start     Start the server"
    echo "  brytools stop      Stop the server"
    echo "  brytools restart   Restart the server"
    echo "  brytools status    Show server + Tailscale status"
    echo "  brytools build     Production build"
    echo "  brytools public    Enable public access (Tailscale Funnel)"
    echo "  brytools private   Disable public access"
    echo "  brytools logs      Tail the log file"
    echo ""
    ;;
esac
CLIEOF

# Stamp in the actual paths
sed -i '' "s|__PROJECT__|$PROJECT|g" "$CLI"
sed -i '' "s|__IP__|$TS_IP|g" "$CLI"
chmod +x "$CLI"
green "✓ CLI installed: ~/bin/brytools"


# ── Ensure ~/bin is in PATH ──────────────
SHELL_RC="$HOME/.zshrc"
if ! grep -q 'HOME/bin' "$SHELL_RC" 2>/dev/null; then
  echo '' >> "$SHELL_RC"
  echo '# BryTools CLI' >> "$SHELL_RC"
  echo 'export PATH="$HOME/bin:$PATH"' >> "$SHELL_RC"
  green "✓ Added ~/bin to PATH in .zshrc"
else
  green "✓ ~/bin already in PATH"
fi

# ── Install watchdog ─────────────────────
WATCHDOG_DIR="$HOME/.brytools-watchdog"
if [ ! -d "$WATCHDOG_DIR" ]; then
  mkdir -p "$WATCHDOG_DIR"
  echo '{"alertTo":""}' > "$WATCHDOG_DIR/config.json"
  green "✓ Watchdog config created (set phone number in Services UI)"
else
  green "✓ Watchdog config exists"
fi

# Check for watchdog script in repo and copy if present
if [ -f "$PROJECT/com.bryanrowland.brytools-watchdog.plist" ]; then
  cp "$PROJECT/com.bryanrowland.brytools-watchdog.plist" "$HOME/Library/LaunchAgents/"
  green "✓ Watchdog plist installed"
fi

# ── Install launchd plist ────────────────
PLIST_SRC="$PROJECT/com.bryanrowland.brytools.plist"
if [ -f "$PLIST_SRC" ]; then
  # Create a fresh plist with correct paths for this machine
  PLIST_DEST="$HOME/Library/LaunchAgents/com.bryan.brytools-app.plist"
  cat > "$PLIST_DEST" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bryan.brytools-app</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>${PROJECT}/node_modules/.bin/next</string>
        <string>start</string>
        <string>-p</string>
        <string>3002</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${PROJECT}/brytools.log</string>
    <key>StandardErrorPath</key>
    <string>${PROJECT}/brytools.log</string>
</dict>
</plist>
PLISTEOF
  dim "  Launchd plist installed (not loaded -- use 'brytools start' for now)"
fi

# ── Data directories ─────────────────────
echo ""
gold "Data Directories"
echo "  BryTools expects external volumes for media storage."
echo "  If present, these will be used automatically:"
echo ""
for DIR in "/Volumes/ME Backup02/BryTranscribe" "/Volumes/ME Backup02/BryTranscribe/Done" "/Volumes/ME Backup02/BryTranscribe/transcriptions" "/Volumes/ME Backup02/BryTranscribe/progress" "/Volumes/ME Backup02/_Dump"; do
  if [ -d "$DIR" ]; then
    green "  ✓ $DIR"
  else
    dim "  ✗ $DIR (will be created when volume is mounted)"
  fi
done

# ── Summary ──────────────────────────────
echo ""
gold "═══════════════════════════════════════"
gold "  Setup Complete"
gold "═══════════════════════════════════════"
echo ""
echo "  Start:   brytools start"
echo "  Status:  brytools status"
echo "  URL:     http://$TS_IP:3002"
echo ""

if [ "$TS_IP" = "localhost" ]; then
  gold "  Next steps:"
  echo "  1. Install Tailscale: https://tailscale.com/download/mac"
  echo "  2. Re-run: ./setup.sh (to update CLI with Tailscale IP)"
  echo ""
fi

dim "  Tip: Open a new terminal tab for PATH changes to take effect."
echo ""
