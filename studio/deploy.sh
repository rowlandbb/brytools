#!/bin/bash
# Deploy batch_transcribe.py to Mac Studio
STUDIO="bryan@100.100.179.121"
STUDIO_PATH="/Users/bryan/models/whisper"
LOCAL_PATH="/Users/bryanrowland/Documents/Vibe/brytools/studio/batch_transcribe.py"

echo "Deploying batch_transcribe.py to Mac Studio..."
scp "$LOCAL_PATH" "$STUDIO:$STUDIO_PATH/batch_transcribe.py"

if [ $? -eq 0 ]; then
  echo "Deployed to $STUDIO:$STUDIO_PATH/"
  echo ""
  echo "If batch_transcribe.py is running on the Studio, restart it:"
  echo "  ssh $STUDIO 'pkill -f batch_transcribe.py'"
  echo "  ssh $STUDIO 'cd $STUDIO_PATH && python3 batch_transcribe.py'"
else
  echo "Deploy failed"
fi
