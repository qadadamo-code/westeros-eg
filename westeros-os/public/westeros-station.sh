#!/data/data/com.termux/files/usr/bin/sh
# Westeros OS - print station for Android (runs inside the free Termux app).
# Same job as westeros-print-station.bat on Windows: it: it takes this branch's print jobs from Westeros and sends them to the
# network printers by IP (port 9100). Link it once from the Westeros station screen in Chrome.
# Install: open Termux and run
#   curl -fsSL https://westeros-os-planet-crm.vercel.app/app/westeros-station.sh | sh
echo "Westeros print station: setting up..."
if ! command -v python >/dev/null 2>&1; then
  yes | pkg install -y python || { echo "Could not install python. Check the internet and run the command again."; exit 1; }
fi
mkdir -p "$HOME/.westeros" "$HOME/.termux/boot"
cat > "$HOME/.westeros/station.py" <<'PY'
import base64, gzip, json, os, socket, sys, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 17777
VERSION = 2
CFG = os.path.expanduser("~/.westeros/station.json")
cfg = None
try:
    with open(CFG) as f:
        cfg = json.load(f)
except Exception:
    cfg = None

def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)

def send_printer(ip, port, data):
    with socket.create_connection((ip, int(port or 9100)), timeout=4) as s:
        s.sendall(data)
        time.sleep(0.2)

def rpc(name, body):
    req = urllib.request.Request(cfg["url"] + "/rest/v1/rpc/" + name, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"apikey": cfg["key"], "Authorization": "Bearer " + cfg["key"], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        t = r.read().decode("utf-8")
        return json.loads(t) if t else None

def poll_forever():
    while True:
        if not cfg:
            time.sleep(1.5)
            continue
        try:
            jobs = rpc("print_station_claim", {"p_token": cfg["token"]}) or []
        except Exception as e:
            log("server:", e)
            time.sleep(5)
            continue
        for j in jobs:
            err = None
            try:
                for _ in range(int(j.get("copies") or 1)):
                    for c in j.get("data") or []:
                        data = gzip.decompress(base64.b64decode(c["gz"])) if c.get("gz") else base64.b64decode(c["b64"])
                        send_printer(str(c["ip"]).strip(), c.get("port") or 9100, data)
                log("printed", j.get("kind"), j.get("id"))
            except Exception as e:
                err = str(e) or e.__class__.__name__
                log("error", j.get("id"), err)
            try:
                rpc("print_station_done", {"p_token": cfg["token"], "p_id": j["id"], "p_error": err})
            except Exception as e:
                log("server:", e)
        if not jobs:
            time.sleep(1.5)

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
        path = self.path.split("?")[0]
        if path == "/ping":
            self.reply(200, json.dumps({"ok": True, "v": VERSION, "os": "android", "linked": bool(cfg)}).encode("utf-8"))
        elif path == "/quit":
            self.reply(200, b'{"ok":true}')
            threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0))).start()
        else:
            self.reply(404, b'{"ok":false}')

    def do_POST(self):
        global cfg
        path = self.path.split("?")[0]
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n).decode("utf-8"))
            if path == "/link":
                if not (body.get("url") and body.get("key") and body.get("token")):
                    return self.reply(400, b'{"ok":false,"error":"missing"}')
                with open(CFG, "w") as f:
                    json.dump(body, f)
                cfg = body
                log("linked")
                return self.reply(200, b'{"ok":true}')
            if path == "/print":
                send_printer(str(body["ip"]).strip(), body.get("port") or 9100, base64.b64decode(body["data"]))
                return self.reply(200, b'{"ok":true}')
            self.reply(404, b'{"ok":false}')
        except Exception as e:
            msg = str(e) or e.__class__.__name__
            log("error:", msg)
            self.reply(500, json.dumps({"ok": False, "error": msg}).encode("utf-8"))

    def log_message(self, *a):
        pass

# a newer copy replaces the one already running
try:
    urllib.request.urlopen("http://127.0.0.1:%d/quit" % PORT, timeout=2).read()
    time.sleep(1)
except Exception:
    pass
try:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
except OSError:
    log("The print station is already running.")
    sys.exit(0)
threading.Thread(target=poll_forever, daemon=True).start()
log("Westeros print station v2 is running on http://localhost:%d" % PORT)
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
echo "Now open the Westeros station screen in Chrome on this device and press the link button."
echo "After that it prints in the background: you can close Chrome. Leave Termux in the background (do not press Exit)."
