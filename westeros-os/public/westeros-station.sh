#!/data/data/com.termux/files/usr/bin/sh
# Westeros OS - print station for Android (runs inside the free Termux app).
# Same job as westeros-print-station.bat on Windows: listens on this device only
# (http://localhost:17777) and passes print jobs from the Westeros station screen
# (open in Chrome on the same device) to network printers by IP (port 9100).
# Install: open Termux and run
#   curl -fsSL https://westeros-os-planet-crm.vercel.app/app/westeros-station.sh | sh
echo "Westeros print station: setting up..."
if ! command -v python >/dev/null 2>&1; then
  yes | pkg install -y python || { echo "Could not install python. Check the internet and run the command again."; exit 1; }
fi
mkdir -p "$HOME/.westeros" "$HOME/.termux/boot"
cat > "$HOME/.westeros/station.py" <<'PY'
import base64, json, socket, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 17777

class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body=b""):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.reply(204)

    def do_GET(self):
        if self.path.split("?")[0] == "/ping":
            self.reply(200, b'{"ok":true,"v":1,"os":"android"}')
        else:
            self.reply(404, b'{"ok":false}')

    def do_POST(self):
        if self.path.split("?")[0] != "/print":
            return self.reply(404, b'{"ok":false}')
        try:
            n = int(self.headers.get("Content-Length") or 0)
            job = json.loads(self.rfile.read(n).decode("utf-8"))
            data = base64.b64decode(job["data"])
            ip, port = str(job["ip"]).strip(), int(job.get("port") or 9100)
            with socket.create_connection((ip, port), timeout=4) as s:
                s.sendall(data)
                time.sleep(0.2)
            print(time.strftime("%H:%M:%S"), "printed", len(data), "bytes to", ip, flush=True)
            self.reply(200, b'{"ok":true}')
        except Exception as e:
            msg = str(e) or e.__class__.__name__
            print(time.strftime("%H:%M:%S"), "error:", msg, flush=True)
            self.reply(500, json.dumps({"ok": False, "error": msg}).encode("utf-8"))

    def log_message(self, *a):
        pass

try:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
except OSError:
    print("The print station is already running.")
    sys.exit(0)
print("Westeros print station is running on http://localhost:%d" % PORT, flush=True)
server.serve_forever()
PY
cat > "$HOME/.westeros/run.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock 2>/dev/null
nohup python "$HOME/.westeros/station.py" >> "$HOME/.westeros/log.txt" 2>&1 &
SH
chmod +x "$HOME/.westeros/run.sh"
# start with the device (needs the Termux:Boot app) and whenever Termux opens
cp "$HOME/.westeros/run.sh" "$HOME/.termux/boot/westeros-station"
grep -q ".westeros/run.sh" "$HOME/.bashrc" 2>/dev/null || echo 'sh "$HOME/.westeros/run.sh" >/dev/null 2>&1' >> "$HOME/.bashrc"
sh "$HOME/.westeros/run.sh"
sleep 1
echo ""
echo "Done. The print station is running."
echo "Now open the Westeros station screen in Chrome on this device and keep it open."
