#!/usr/bin/env python3
"""ProofShot sidecar for Hermes WebUI extension.

Provides a local HTTP API that wraps the proofshot CLI for the browser extension.
Runs on port 17990 by default.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

SIDECAR_PORT = int(os.environ.get("PS_SIDECAR_PORT", "17990"))
HOST = os.environ.get("PS_SIDECAR_HOST", "127.0.0.1")

PROOFSHOT_BIN = shutil.which("proofshot")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd, timeout=15):
    """Run a shell command and return stdout, stderr, exit_code."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip(), r.stderr.strip(), r.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", -1
    except FileNotFoundError:
        return "", "Command not found", -1


def get_proofshot_version():
    if not PROOFSHOT_BIN:
        return None
    out, _, rc = run_cmd([PROOFSHOT_BIN, "--version"])
    return out if rc == 0 else None


def get_session_status():
    """Check if a proofshot session is active by looking for .session.json."""
    # Scan common locations for session files
    artifacts_dirs = [
        Path.cwd() / "proofshot-artifacts",
        Path.home() / "proofshot-artifacts",
    ]
    for ad in artifacts_dirs:
        if ad.exists() and ad.is_dir():
            sessions = sorted(ad.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
            if sessions:
                latest = sessions[0]
                session_file = latest / ".session.json"
                if session_file.exists():
                    try:
                        data = json.loads(session_file.read_text())
                        if data.get("status") == "recording":
                            return {"status": "recording", "description": data.get("description", ""), "dir": str(latest)}
                    except (json.JSONDecodeError, OSError):
                        pass
                # Check if any session file looks active
                return {"status": "idle", "dir": str(latest) if latest else None}
    return {"status": "idle", "dir": None}


def list_artifact_sessions():
    sessions = []
    artifacts_dirs = [
        Path.cwd() / "proofshot-artifacts",
        Path.home() / "proofshot-artifacts",
    ]
    for ad in artifacts_dirs:
        if ad.exists() and ad.is_dir():
            for item in sorted(ad.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if item.is_dir():
                    session = {"dir": str(item), "name": item.name}
                    meta = {}
                    session_file = item / ".session.json"
                    if session_file.exists():
                        try:
                            meta = json.loads(session_file.read_text())
                        except (json.JSONDecodeError, OSError):
                            pass
                    session["description"] = meta.get("description", item.name)
                    session["timestamp"] = meta.get("started_at", time.ctime(item.stat().st_mtime))
                    session["duration"] = meta.get("duration_seconds", 0)
                    screenshots = list(item.glob("step-*.png")) + list(item.glob("step-*.jpg"))
                    session["screenshots"] = len(screenshots)
                    errors = meta.get("errors", [])
                    session["errors"] = errors
                    session["has_video"] = (item / "session.webm").exists()
                    session["has_viewer"] = (item / "viewer.html").exists()
                    sessions.append(session)
    return sessions


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------

class SidecarHandler(BaseHTTPRequestHandler):

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_text(self, text, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(text.encode())

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._send_json({"status": "ok", "version": 1})

        elif path == "/which":
            if PROOFSHOT_BIN:
                ver = get_proofshot_version()
                self._send_json({"path": PROOFSHOT_BIN, "version": ver or "unknown"})
            else:
                self._send_json({"error": "proofshot not found on PATH"}, 404)

        elif path == "/session":
            status = get_session_status()
            self._send_json(status)

        elif path == "/artifacts":
            sessions = list_artifact_sessions()
            self._send_json({"sessions": sessions})

        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/start":
            body = self._read_body()
            workdir = body.get("workdir", str(Path.cwd()))
            desc = body.get("description", f"WebUI session {uuid.uuid4().hex[:8]}")

            if not PROOFSHOT_BIN:
                self._send_json({"error": "proofshot not installed"}, 404)
                return

            try:
                r = subprocess.run(
                    [PROOFSHOT_BIN, "start", "--description", desc],
                    capture_output=True, text=True, timeout=30,
                    cwd=workdir if os.path.isdir(workdir) else None,
                )
                if r.returncode == 0:
                    self._send_json({"status": "started", "output": r.stdout.strip()})
                else:
                    self._send_json({"error": r.stderr.strip() or r.stdout.strip()}, 500)
            except subprocess.TimeoutExpired:
                self._send_json({"error": "command timed out"}, 500)
            except Exception as e:
                self._send_json({"error": str(e)}, 500)

        elif path == "/stop":
            if not PROOFSHOT_BIN:
                self._send_json({"error": "proofshot not installed"}, 404)
                return

            try:
                r = subprocess.run(
                    [PROOFSHOT_BIN, "stop"],
                    capture_output=True, text=True, timeout=30,
                )
                if r.returncode == 0:
                    self._send_json({"status": "stopped", "output": r.stdout.strip()})
                else:
                    self._send_json({"error": r.stderr.strip() or r.stdout.strip()}, 500)
            except subprocess.TimeoutExpired:
                self._send_json({"error": "command timed out"}, 500)
            except Exception as e:
                self._send_json({"error": str(e)}, 500)

        else:
            self._send_json({"error": "not found"}, 404)

    def log_message(self, format, *args):
        """Quiet logging — only errors."""
        if args and "404" in args[0]:
            sys.stderr.write(f"[proofshot-sidecar] {args[0]}\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    server = HTTPServer((HOST, SIDECAR_PORT), SidecarHandler)
    print(f"[proofshot-sidecar] Listening on http://{HOST}:{SIDECAR_PORT}", flush=True)
    if not PROOFSHOT_BIN:
        print(f"[proofshot-sidecar] WARNING: proofshot CLI not found on PATH", flush=True)
    else:
        ver = get_proofshot_version()
        print(f"[proofshot-sidecar] ProofShot CLI: {PROOFSHOT_BIN} (v{ver or '?'})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[proofshot-sidecar] Shutting down", flush=True)
        server.server_close()


if __name__ == "__main__":
    main()
