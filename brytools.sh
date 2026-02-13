#!/bin/bash
# brytools - CLI for BryTools server management
PLIST="com.bryanrowland.brytools"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST.plist"
LOG="/Users/bryanrowland/Documents/Vibe/brytools/brytools.log"
PORT=3002

case "$1" in
  start)
    echo "Starting BryTools..."
    launchctl load "$PLIST_PATH" 2>/dev/null
    launchctl start "$PLIST" 2>/dev/null
    sleep 2
    if lsof -i :$PORT > /dev/null 2>&1; then
      echo "BryTools running on port $PORT"
    else
      echo "Starting up... check 'brytools status' in a few seconds"
    fi
    ;;
  stop)
    echo "Stopping BryTools..."
    launchctl stop "$PLIST" 2>/dev/null
    launchctl unload "$PLIST_PATH" 2>/dev/null
    echo "Stopped"
    ;;
  restart)
    echo "Restarting BryTools..."
    launchctl stop "$PLIST" 2>/dev/null
    sleep 1
    launchctl start "$PLIST" 2>/dev/null
    sleep 2
    if lsof -i :$PORT > /dev/null 2>&1; then
      echo "BryTools running on port $PORT"
    else
      echo "Restarting... check 'brytools status' in a few seconds"
    fi
    ;;
  status)
    if lsof -i :$PORT > /dev/null 2>&1; then
      PID=$(lsof -ti :$PORT | head -1)
      echo "BryTools running (PID $PID) on port $PORT"
      echo "   http://100.80.21.63:$PORT"
    else
      echo "BryTools not running"
    fi
    ;;
  logs)
    tail -f "$LOG"
    ;;
  install)
    echo "Installing LaunchAgent..."
    cp "/Users/bryanrowland/Documents/Vibe/brytools/$PLIST.plist" "$PLIST_PATH"
    launchctl load "$PLIST_PATH"
    echo "Installed and loaded"
    ;;
  *)
    echo "Usage: brytools {start|stop|restart|status|logs|install}"
    exit 1
    ;;
esac
