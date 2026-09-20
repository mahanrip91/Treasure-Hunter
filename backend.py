import json
import os
import time
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
CHAT_ID = os.environ.get("CHAT_ID", "7001392382")

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

POLL_SECONDS = 5


def request_json(url, method="GET", headers=None, data=None):
    body = None

    if data is not None:
        body = json.dumps(data).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=body,
        headers=headers or {},
        method=method
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read().decode("utf-8")
        return response.status, json.loads(raw) if raw else None


def telegram(method, data):
    body = urllib.parse.urlencode(data).encode("utf-8")

    request = urllib.request.Request(
        f"{TELEGRAM_API}/{method}",
        data=body,
        method="POST"
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def firebase_removed():
    print("Firebase watcher disabled.")


def supabase_get_newest():
    url = (
        f"{SUPABASE_URL}/rest/v1/locations"
        "?select=id,username,latitude,longitude,accuracy,location_timestamp,created_at"
        "&order=id.desc"
        "&limit=50"
    )

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    _, data = request_json(url, headers=headers)

    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected Supabase response: {data}")

    return data


def send_location(row):
    latitude = float(row["latitude"])
    longitude = float(row["longitude"])
    accuracy = float(row.get("accuracy") or 0)

    username = row.get("username") or "Unknown"
    row_id = row["id"]

    maps_url = (
        "https://www.google.com/maps/search/?api=1&query="
        f"{latitude},{longitude}"
    )

    # Telegram location
    result = telegram(
        "sendLocation",
        {
            "chat_id": CHAT_ID,
            "latitude": latitude,
            "longitude": longitude
        }
    )

    if not result.get("ok"):
        raise RuntimeError(
            result.get("description", "Telegram sendLocation failed")
        )

    # اطلاعات تکمیلی
    message = (
        "📍 <b>Treasure Hunter</b>\n\n"
        f"👤 Username: <code>{username}</code>\n"
        f"🌐 Latitude: <code>{latitude:.6f}</code>\n"
        f"🌐 Longitude: <code>{longitude:.6f}</code>\n"
        f"🎯 Accuracy: <code>{accuracy:.1f} m</code>\n"
        f"🆔 ID: <code>{row_id}</code>\n\n"
        f'🗺 <a href="{maps_url}">Google Maps</a>'
    )

    result = telegram(
        "sendMessage",
        {
            "chat_id": CHAT_ID,
            "text": message,
            "parse_mode": "HTML"
        }
    )

    if not result.get("ok"):
        raise RuntimeError(
            result.get("description", "Telegram sendMessage failed")
        )

    print(
        f"[SENT] #{row_id} "
        f"{username} "
        f"{latitude:.6f},"
        f"{longitude:.6f}"
    )


def main():
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL تنظیم نشده است.")

    if not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_KEY تنظیم نشده است.")

    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN تنظیم نشده است.")

    print("================================")
    print(" Treasure Hunter Backend")
    print("================================")
    print("Supabase watcher started.")
    print("Checking immediately...")
    print("")

    sent_ids = set()

    while True:
        try:
            locations = supabase_get_newest()

            # قدیمی‌ترین → جدیدترین
            locations.reverse()

            for row in locations:
                row_id = row["id"]

                if row_id in sent_ids:
                    continue

                send_location(row)
                sent_ids.add(row_id)

            # جلوگیری از رشد بی‌نهایت حافظه
            if len(sent_ids) > 1000:
                sent_ids = set(sorted(sent_ids)[-500:])

        except Exception as error:
            print("[WATCH ERROR]", repr(error))

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
