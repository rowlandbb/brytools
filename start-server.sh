#!/bin/bash
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
cd /Volumes/RowMedia/CODE/brytools
exec /opt/homebrew/bin/node node_modules/.bin/next start -p 3002
