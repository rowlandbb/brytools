#!/bin/bash
# BryTools keeper -- restarts on crash, started via cron @reboot
export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin
LOG="/Users/bryanrowland/Documents/Vibe/brytools/brytools.log"
APPDIR="/Users/bryanrowland/Documents/Vibe/brytools"

# Wait for system to settle after reboot
sleep 15

while true; do
    # Check if already running
    if lsof -i :3002 -sTCP:LISTEN >/dev/null 2>&1; then
        sleep 30
        continue
    fi

    echo "$(date): [keeper] BryTools not running, starting..." >> "$LOG"
    cd "$APPDIR"
    /opt/homebrew/bin/node node_modules/.bin/next start -p 3002 >> "$LOG" 2>&1

    # If we get here, the server exited
    echo "$(date): [keeper] BryTools exited, restarting in 10s..." >> "$LOG"
    sleep 10
done
