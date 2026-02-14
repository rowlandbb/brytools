#!/bin/bash
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
export HOME=/Users/bryanrowland

echo "$(date): start-server.sh launching..." 
echo "  PATH=$PATH"
echo "  PWD=$(pwd)"
echo "  NODE=$(which node) -- $(node -v 2>&1)"
echo "  Working dir: /Users/bryanrowland/Documents/Vibe/brytools"

cd /Users/bryanrowland/Documents/Vibe/brytools || { echo "FAILED to cd"; exit 1; }

echo "  .next exists: $(test -d .next && echo YES || echo NO)"
echo "  Launching next start..."

exec /opt/homebrew/bin/node node_modules/.bin/next start -p 3002
