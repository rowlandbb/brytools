#!/bin/bash
# ─────────────────────────────────────────────────────
# BryTools Watchdog
# Checks service health + LucidLink every 60s
# Sends SMS alerts via Twilio
# ─────────────────────────────────────────────────────

# ── Config ──
CONFIG_FILE="$HOME/.brytools-watchdog/config.json"
ALERT_TO=""  # Overridden from config.json if set
COOLDOWN=300 # Don't re-alert same issue for 5 minutes
STATE_DIR="$HOME/.brytools-watchdog"
INCIDENT_LOG="$STATE_DIR/incidents.json"

# Twilio (disabled - using iMessage instead)
TWILIO_SID=""
TWILIO_TOKEN=""
TWILIO_FROM=""

mkdir -p "$STATE_DIR"
[ ! -f "$INCIDENT_LOG" ] && echo "[]" > "$INCIDENT_LOG"

# Load phone number from config
if [ -f "$CONFIG_FILE" ]; then
  CONFIGURED=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('alertTo',''))" 2>/dev/null)
  [ -n "$CONFIGURED" ] && ALERT_TO="$CONFIGURED"
fi

# ── Helpers ──

send_alert() {
  local msg="$1"
  local timestamp
  timestamp=$(date '+%I:%M %p')

  # Log to file always
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $msg" >> "$STATE_DIR/watchdog.log"

  if [ -z "$ALERT_TO" ]; then
    echo "[WATCHDOG] No ALERT_TO configured. Alert: $msg"
    return
  fi

  # Send via iMessage
  osascript <<EOF 2>/dev/null
tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "$ALERT_TO" of targetService
  send "⚠️ Mac Mini [$timestamp]: $msg" to targetBuddy
end tell
EOF
}
is_in_cooldown() {
  local key="$1"
  local file="$STATE_DIR/cooldown_$key"
  if [ -f "$file" ]; then
    local last
    last=$(cat "$file")
    local now
    now=$(date +%s)
    local diff=$((now - last))
    if [ "$diff" -lt "$COOLDOWN" ]; then
      return 0  # Still in cooldown
    fi
  fi
  return 1  # Not in cooldown
}

set_cooldown() {
  local key="$1"
  date +%s > "$STATE_DIR/cooldown_$key"
}

clear_cooldown() {
  local key="$1"
  rm -f "$STATE_DIR/cooldown_$key"
}

log_incident() {
  local svc="$1" event="$2" ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  # Append to JSON array (simple approach)
  python3 -c "
import json, sys
try:
    with open('$INCIDENT_LOG') as f: data = json.load(f)
except: data = []
data.append({'ts': '$ts', 'service': '$svc', 'event': '$event'})
data = data[-200:]  # Keep last 200
with open('$INCIDENT_LOG', 'w') as f: json.dump(data, f)
" 2>/dev/null
}

# ── Service Checks ──

check_service() {
  local name="$1" port="$2" key="$3"
  local pid
  pid=$(lsof -ti:"$port" 2>/dev/null | head -1)

  if [ -z "$pid" ]; then
    # Service is down
    if ! is_in_cooldown "$key"; then
      send_alert "$name is DOWN (port $port not responding)"
      set_cooldown "$key"
      log_incident "$key" "down"
    fi
    return 1
  else
    # Service is up - if it was down before, send recovery
    if [ -f "$STATE_DIR/cooldown_$key" ]; then
      send_alert "$name is back UP ✅"
      clear_cooldown "$key"
      log_incident "$key" "recovered"
    fi
    return 0
  fi
}

check_lucidlink() {
  if [ -d "/Volumes/bryan/bryan/Canon" ]; then
    # Mounted - check if it was down
    if [ -f "$STATE_DIR/cooldown_lucidlink" ]; then
      send_alert "LucidLink is back ONLINE ✅"
      clear_cooldown "lucidlink"
      log_incident "lucidlink" "recovered"
    fi
    return 0
  else
    # Not mounted
    if ! is_in_cooldown "lucidlink"; then
      send_alert "LucidLink is OFFLINE — Skinwalker Archive degraded"
      set_cooldown "lucidlink"
      log_incident "lucidlink" "offline"
    fi
    return 1
  fi
}

check_volume() {
  local path="$1" name="$2" key="$3"
  if [ -d "$path" ]; then
    if [ -f "$STATE_DIR/cooldown_$key" ]; then
      send_alert "$name is back ONLINE ✅"
      clear_cooldown "$key"
      log_incident "$key" "recovered"
    fi
  else
    if ! is_in_cooldown "$key"; then
      send_alert "$name volume is OFFLINE"
      set_cooldown "$key"
      log_incident "$key" "offline"
    fi
  fi
}

# ── Main ──

run_checks() {
  check_service "BryTools" 3002 "brytools"
  check_service "Skinwalker Archive" 5001 "skinwalker"
  check_service "Ollama" 11434 "ollama"
  check_lucidlink
  check_volume "/Volumes/RowMedia" "RowMedia" "vol_rowmedia"
}

# Run once (launchd handles the interval)
run_checks
