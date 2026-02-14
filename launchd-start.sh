#!/bin/bash
export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin
export NODE_ENV=production
cd /Users/bryanrowland/Documents/Vibe/brytools
exec /opt/homebrew/bin/node node_modules/.bin/next start -p 3002
