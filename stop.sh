#!/data/data/com.termux/files/usr/bin/bash

echo ""
echo "🛑 Stopping Treasure Hunter..."

pkill -f "python server.py" 2>/dev/null

echo "✅ Stopped."
echo ""
