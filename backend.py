import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# توکن جدید رباتت را اینجا روی گوشی خودت قرار بده
BOT_TOKEN = "8513345623:AAHIjN1o0cZY0QftvnRy3xXdZWUJAnOvVpI"

CHAT_ID = "7001392382"

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


def telegram(method, data):
    body = urllib.parse.urlencode(data).encode("utf-8")

    request = urllib.request.Request(
        f"{TELEGRAM_API}/{method}",
        data=body,
        method="POST"
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


class Handler(BaseHTTPRequestHandler):

    def send_json(self, status, data):
        body = json.dumps(
            data,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "POST, OPTIONS"
        )
        self.end_headers()

        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)

        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "POST, OPTIONS"
        )

        self.end_headers()

    def do_POST(self):

        if self.path != "/location":
            self.send_json(
                404,
                {
                    "ok": False,
                    "error": "Not found"
                }
            )
            return

        try:
            length = int(
                self.headers.get(
                    "Content-Length",
                    0
                )
            )

            raw = self.rfile.read(length)

            data = json.loads(
                raw.decode("utf-8")
            )

            latitude = float(
                data["latitude"]
            )

            longitude = float(
                data["longitude"]
            )

            accuracy = float(
                data.get(
                    "accuracy",
                    0
                )
            )

            # ارسال Location واقعی تلگرام
            result = telegram(
                "sendLocation",
                {
                    "chat_id": CHAT_ID,
                    "latitude": latitude,
                    "longitude": longitude
                }
            )

            if not result.get("ok"):
                raise Exception(
                    result.get(
                        "description",
                        "Telegram error"
                    )
                )

            # پیام اطلاعات تکمیلی
            maps_url = (
                "https://www.google.com/maps/"
                "search/?api=1&query="
                f"{latitude},{longitude}"
            )

            message = (
                "📍 <b>Treasure Hunter</b>\n\n"
                f"Latitude: <code>{latitude:.6f}</code>\n"
                f"Longitude: <code>{longitude:.6f}</code>\n"
                f"Accuracy: <code>{accuracy:.1f} m</code>\n\n"
                f'🗺 <a href="{maps_url}">'
                "Google Maps</a>"
            )

            telegram(
                "sendMessage",
                {
                    "chat_id": CHAT_ID,
                    "text": message,
                    "parse_mode": "HTML"
                }
            )

            print(
                f"[LOCATION] "
                f"{latitude:.6f}, "
                f"{longitude:.6f} "
                f"accuracy={accuracy:.1f}m"
            )

            self.send_json(
                200,
                {
                    "ok": True
                }
            )

        except Exception as error:

            print(
                "[ERROR]",
                repr(error)
            )

            self.send_json(
                500,
                {
                    "ok": False,
                    "error": str(error)
                }
            )


print("================================")
print(" Treasure Hunter Backend")
print("================================")
print("Listening on 127.0.0.1:3000")
print("Waiting for GPS...")
print("")


server = ThreadingHTTPServer(
    ("127.0.0.1", 3000),
    Handler
)

server.serve_forever()
