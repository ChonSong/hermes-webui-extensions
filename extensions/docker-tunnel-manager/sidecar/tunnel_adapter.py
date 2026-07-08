"""
Tunnel Adapter — pluggable abstraction for tunnel providers.

Defines an abstract interface (ABC) that any tunnel backend can implement.
The sidecar imports and uses these adapters instead of inline tunnel code,
keeping the /api/tunnels endpoints backward compatible.

Supported adapters:
  - CloudflareAdapter  (working, wraps cloudflared CLI)
  - NgrokAdapter       (stub — not yet implemented)
  - BoreAdapter        (stub — not yet implemented)

Protocol contract (each adapter must implement):

    list_tunnels() -> list[dict]
        Return a list of tunnel info dicts, each containing at minimum:
        {"name": str, "id": str, "connectors": [...], "ingress": [...]}

    tunnel_health(tunnel_name: str) -> list[dict]
        Return health-check results for each ingress route:
        [{"hostname": str, "service": str, "status": str, "http_code": str, "latency": float}, ...]

    tunnel_logs(tunnel_name: str, lines: int = 50) -> str
        Return recent tunnel log output as a plain string.
"""

from __future__ import annotations

import abc
import os
import re
import subprocess
import time


# ── Abstract base ────────────────────────────────────────────────────


class TunnelAdapter(abc.ABC):
    """Abstract protocol that all tunnel adapters must implement."""

    @abc.abstractmethod
    def list_tunnels(self) -> list[dict]:
        """Return list of tunnel info dicts."""

    @abc.abstractmethod
    def tunnel_health(self, tunnel_name: str) -> list[dict]:
        """Return health-check results for all ingress routes."""

    @abc.abstractmethod
    def tunnel_logs(self, tunnel_name: str, lines: int = 50) -> str:
        """Return recent tunnel log output."""


# ── Cloudflare Adapter ───────────────────────────────────────────────


class CloudflareAdapter(TunnelAdapter):
    """Working adapter that wraps the cloudflared CLI.

    Required on the host: cloudflared binary (in PATH), curl, journalctl.
    """

    def __init__(
        self,
        config_path: str = "~/.cloudflared/config.yml",
        tunnel_name: str = "codeovertcp",
        log_service: str = "gto-wizard-tunnel.service",
    ):
        self.config_path = os.path.expanduser(config_path)
        self.tunnel_name = tunnel_name
        self.log_service = log_service

    # -- helpers --

    def _parse_ingress(self) -> list[dict]:
        """Parse ingress rules from cloudflared config.yml."""
        ingress: list[dict] = []
        if not os.path.exists(self.config_path):
            return ingress
        with open(self.config_path) as f:
            in_ing = False
            for line in f:
                s = line.strip()
                if s == "ingress:":
                    in_ing = True
                    continue
                if in_ing:
                    if s.startswith("- hostname:"):
                        ingress.append({"hostname": s.split(":", 1)[-1].strip(), "service": "?"})
                    elif s.startswith("service:") and ingress:
                        ingress[-1]["service"] = s.split(":", 1)[-1].strip()
                    elif not s.startswith("- ") and not s.startswith("  "):
                        break
        return ingress

    def _run_tunnel_info(self) -> dict | None:
        """Call 'cloudflared tunnel info' and return parsed dict, or None on failure."""
        try:
            r = subprocess.run(
                ["cloudflared", "tunnel", "info", self.tunnel_name],
                capture_output=True, text=True, timeout=10,
            )
        except Exception:
            return None
        info: dict = {"name": self.tunnel_name, "id": "", "connectors": [], "ingress": self._parse_ingress()}
        for line in r.stdout.splitlines():
            line = line.strip()
            if "ID:" in line and "CONNECTOR" not in line:
                info["id"] = line.split("ID:")[-1].strip()
            elif line.startswith(" ") and len(line) > 40:
                parts = line.split()
                if len(parts) >= 6:
                    info["connectors"].append({
                        "id": parts[0],
                        "age": parts[2],
                        "origin": parts[-2],
                    })
        return info

    def _get_connector_count(self) -> int | None:
        """Try to get connector count from 'cloudflared tunnel list'."""
        try:
            r = subprocess.run(
                ["cloudflared", "tunnel", "list"],
                capture_output=True, text=True, timeout=10,
            )
            m = re.search(r'(\d+)\s+connector', r.stdout)
            if m:
                return int(m.group(1))
        except Exception:
            pass
        return None

    # -- public interface --

    def list_tunnels(self) -> list[dict]:
        """Discover and return tunnel info."""
        if not os.path.exists(self.config_path):
            return []
        info = self._run_tunnel_info()
        if info is None:
            return []
        cc = self._get_connector_count()
        if cc is not None:
            info["connector_count"] = cc
        else:
            info["connector_count"] = len(info.get("connectors", []))
        return [info]

    def tunnel_health(self, tunnel_name: str) -> list[dict]:
        """Check HTTP health of every ingress route."""
        info = self._run_tunnel_info()
        if info is None:
            return []
        routes: list[dict] = []
        for ing in info.get("ingress", []):
            hostname = ing.get("hostname", "")
            url = f"https://{hostname}/"
            start = time.time()
            try:
                r = subprocess.run(
                    ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                     "--connect-timeout", "5", "--max-time", "10", url],
                    capture_output=True, text=True, timeout=12,
                )
                latency = round(time.time() - start, 2)
                code = r.stdout.strip()
                if code in ("401", "403"):
                    status = "authed"
                elif code in ("502", "503", "000", ""):
                    status = "error"
                elif code in ("301", "302", "307", "308"):
                    status = "redirect"
                else:
                    status = "ok"
                routes.append({
                    "hostname": hostname,
                    "service": ing.get("service", ""),
                    "status": status,
                    "http_code": code,
                    "latency": latency,
                })
            except subprocess.TimeoutExpired:
                routes.append({
                    "hostname": hostname,
                    "service": ing.get("service", ""),
                    "status": "timeout",
                    "http_code": "",
                    "latency": 10.0,
                })
            except Exception:
                routes.append({
                    "hostname": hostname,
                    "service": ing.get("service", ""),
                    "status": "error",
                    "http_code": "",
                    "latency": 0,
                })
        return routes

    def tunnel_logs(self, tunnel_name: str, lines: int = 50) -> str:
        """Fetch recent tunnel logs via journalctl."""
        try:
            r = subprocess.run(
                ["journalctl", "--user", "-u", self.log_service,
                 "--no-pager", "-n", str(lines)],
                capture_output=True, text=True, timeout=10,
            )
            return r.stdout
        except Exception as e:
            return f"journalctl failed: {e}"


# ── Ngrok Adapter (stub) ─────────────────────────────────────────────


class NgrokAdapter(TunnelAdapter):
    """Stub for ngrok tunnel management.

    To implement:
      - Use the ngrok agent API (localhost:4040/api/tunnels) for list/health.
      - Logs available via ngrok dashboard or local log file.
    """

    def __init__(self, api_url: str = "http://127.0.0.1:4040/api"):
        self.api_url = api_url

    def list_tunnels(self) -> list[dict]:
        raise NotImplementedError(
            "NgrokAdapter is not yet implemented. "
            "Query the ngrok agent API at {}/tunnels for tunnel list.".format(self.api_url)
        )

    def tunnel_health(self, tunnel_name: str) -> list[dict]:
        raise NotImplementedError(
            "NgrokAdapter is not yet implemented. "
            "Use the ngrok agent API at {}/tunnels to check health.".format(self.api_url)
        )

    def tunnel_logs(self, tunnel_name: str, lines: int = 50) -> str:
        raise NotImplementedError(
            "NgrokAdapter is not yet implemented. "
            "Use 'ngrok logs' or check the ngrok dashboard for log output."
        )


# ── Bore Adapter (stub) ──────────────────────────────────────────────


class BoreAdapter(TunnelAdapter):
    """Stub for bore tunnel management.

    Bore is a minimal self-hosted alternative to ngrok.
    To implement:
      - Parse bore's client output or use its HTTP API (if enabled).
      - Logs come from the bore client's stdout/stderr.
    """

    def __init__(self, bore_host: str = "bore.pub"):
        self.bore_host = bore_host

    def list_tunnels(self) -> list[dict]:
        raise NotImplementedError(
            "BoreAdapter is not yet implemented. "
            "Bore runs as a CLI client; parse its output or enable its HTTP API."
        )

    def tunnel_health(self, tunnel_name: str) -> list[dict]:
        raise NotImplementedError(
            "BoreAdapter is not yet implemented. "
            "Use 'curl' against bore-proxied endpoints to check health."
        )

    def tunnel_logs(self, tunnel_name: str, lines: int = 50) -> str:
        raise NotImplementedError(
            "BoreAdapter is not yet implemented. "
            "Capture bore client stdout/stderr for log output."
        )
