#!/data/data/com.termux/files/usr/bin/bash

cd "/sdcard/project/Treasure Hunter"

echo ""
echo "🎮 Starting Treasure Hunter..."
echo ""

if [ ! -f "config.json" ]; then

    echo "❌ config.json پیدا نشد."

    exit 1
fi


if [ ! -f "server.py" ]; then

    echo "❌ server.py پیدا نشد."

    exit 1
fi


if [ ! -d "public" ]; then

    echo "❌ پوشه public پیدا نشد."

    exit 1
fi


echo "⚙️ Config: OK"
echo "🌐 Website: OK"
echo "🤖 Telegram Backend: OK"
echo ""


python server.py
