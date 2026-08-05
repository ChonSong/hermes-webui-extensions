"""Behavioral tests for the compatibility harness hardening seams."""

from __future__ import annotations

import json
import importlib.util
import functools
import http.server
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_smoke  # noqa: E402


_CHROMIUM_CHECK: bool | None = None
_CHROMIUM_ERROR = ""


class _FakeRoute:
    def __init__(
        self,
        url: str,
        *,
        method: str = "GET",
        resource_type: str = "script",
    ) -> None:
        self.request = SimpleNamespace(url=url)
        self.request.method = method
        self.request.resource_type = resource_type
        self.continued = 0
        self.aborted = 0

    def continue_(self) -> None:
        self.continued += 1

    def abort(self) -> None:
        self.aborted += 1


class _FakeWebSocket:
    def __init__(self, url: str) -> None:
        self.url = url
        self.connected = 0
        self.closed: tuple[int | None, str | None] | None = None

    def connect_to_server(self) -> None:
        self.connected += 1

    def close(self, *, code: int | None = None, reason: str | None = None) -> None:
        self.closed = (code, reason)


class _FakeContext:
    def __init__(self) -> None:
        self.http_handler = None
        self.websocket_handler = None

    def route(self, _pattern: str, handler) -> None:
        self.http_handler = handler

    def route_web_socket(self, _pattern: str, handler) -> None:
        self.websocket_handler = handler


class _RunningProcess:
    def poll(self) -> None:
        return None


class _QuietFixtureHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


class _FixtureServer:
    def __init__(self, root: Path) -> None:
        handler = functools.partial(_QuietFixtureHandler, directory=str(root))
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(
            target=self.server.serve_forever,
            name="compatibility-fixture-server",
            daemon=True,
        )

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_port}"

    def __enter__(self) -> "_FixtureServer":
        self.thread.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


def _chromium_available(test_case: unittest.TestCase) -> None:
    global _CHROMIUM_CHECK, _CHROMIUM_ERROR
    if _CHROMIUM_CHECK is True:
        return
    if _CHROMIUM_CHECK is False:
        test_case.skipTest(_CHROMIUM_ERROR)
    if not importlib.util.find_spec("playwright"):
        _CHROMIUM_CHECK = False
        _CHROMIUM_ERROR = "Playwright is installed only in the browser-smoke environment"
        test_case.skipTest("Playwright is installed only in the browser-smoke environment")
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            browser.close()
            _CHROMIUM_CHECK = True
    except Exception as exc:  # pragma: no cover - host-dependent
        _CHROMIUM_CHECK = False
        _CHROMIUM_ERROR = f"Chromium is unavailable: {exc}"
        test_case.skipTest(f"Chromium is unavailable: {exc}")


def _reference_resources() -> tuple[str, ...]:
    spec = browser_smoke.REFERENCE_ALLOWLIST["mobile-conversations"]
    return (spec.script_fragment, spec.stylesheet_fragment)


class EnvironmentIsolationTests(unittest.TestCase):
    def test_child_environment_is_allowlisted_and_state_is_isolated(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state_root = Path(temp) / "state"
            inherited = {
                "PATH": "/sentinel/bin",
                "LANG": "C.UTF-8",
                "LC_ALL": "C.UTF-8",
                "CLAUDE_CODE_OAUTH_TOKEN": "sentinel-secret",
                "PYTHONPATH": "/sentinel/imports",
                "PYTHONHOME": "/sentinel/python",
                "HERMES_PROVIDER": "sentinel-provider",
                "HERMES_GATEWAY_URL": "https://sentinel.invalid",
                "HERMES_WEBUI_UNKNOWN": "sentinel-unknown-hermes-setting",
                "HTTPS_PROXY": "http://sentinel.invalid:8080",
                "UNKNOWN_SENTINEL": "must-not-cross-boundary",
            }
            with mock.patch.dict(os.environ, inherited, clear=True):
                env = browser_smoke._sanitized_environment(
                    state_root=state_root,
                    agent_stub=state_root / "agent-stub",
                    extension_root=state_root / "extensions",
                    manifest_relative="manifest.json",
                    port=9876,
                )
                child = subprocess.run(
                    [
                        sys.executable,
                        "-c",
                        "import json, os; print(json.dumps(dict(os.environ)))",
                    ],
                    env=env,
                    check=True,
                    capture_output=True,
                    text=True,
                )

            observed = json.loads(child.stdout)
            self.assertEqual(observed["PATH"], "/sentinel/bin")
            self.assertEqual(observed["LANG"], "C.UTF-8")
            self.assertEqual(observed["LC_ALL"], "C.UTF-8")
            self.assertEqual(observed["NO_PROXY"], "127.0.0.1,localhost,[::1]")
            for key in (
                "CLAUDE_CODE_OAUTH_TOKEN",
                "PYTHONPATH",
                "PYTHONHOME",
                "HERMES_PROVIDER",
                "HERMES_GATEWAY_URL",
                "HERMES_WEBUI_UNKNOWN",
                "HTTPS_PROXY",
                "UNKNOWN_SENTINEL",
            ):
                self.assertNotIn(key, observed)
            self.assertEqual(observed["PYTHONNOUSERSITE"], "1")
            for key in (
                "HOME",
                "XDG_CONFIG_HOME",
                "XDG_CACHE_HOME",
                "XDG_DATA_HOME",
                "XDG_STATE_HOME",
                "HERMES_HOME",
                "HERMES_WEBUI_STATE_DIR",
                "HERMES_WEBUI_DEFAULT_WORKSPACE",
            ):
                self.assertTrue(
                    Path(observed[key]).is_relative_to(state_root),
                    f"{key} escaped state root",
                )

    def test_health_probe_ignores_parent_proxy_environment(self) -> None:
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - stdlib callback name
                if self.path == "/health":
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"ok")
                else:
                    self.send_error(404)

            def log_message(self, _format: str, *_args: object) -> None:
                return

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with mock.patch.dict(
                os.environ,
                {
                    "HTTP_PROXY": "http://127.0.0.1:1",
                    "HTTPS_PROXY": "http://127.0.0.1:1",
                    "ALL_PROXY": "http://127.0.0.1:1",
                    "NO_PROXY": "",
                },
                clear=False,
            ):
                healthy = browser_smoke._wait_for_health(
                    f"http://127.0.0.1:{server.server_port}",
                    _RunningProcess(),
                    timeout=2,
                )
            self.assertTrue(healthy)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


class BrowserBoundaryTests(unittest.TestCase):
    def test_http_and_websocket_guards_allow_only_loopback(self) -> None:
        context = _FakeContext()
        events = browser_smoke._install_network_guards(context)
        self.assertIsNotNone(context.http_handler)
        self.assertIsNotNone(context.websocket_handler)

        loopback = _FakeRoute("http://localhost:8789/health")
        ipv6 = _FakeRoute("https://[::1]:8789/app")
        baseline = _FakeRoute(
            "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"
        )
        unexpected = _FakeRoute("https://extension-phone-home.invalid/collect")
        for route in (loopback, ipv6, baseline, unexpected):
            context.http_handler(route)

        self.assertEqual(loopback.continued, 1)
        self.assertEqual(ipv6.continued, 1)
        self.assertEqual(baseline.aborted, 1)
        self.assertEqual(unexpected.aborted, 1)
        self.assertEqual(
            events["blocked_http"][0]["classification"], "core-baseline"
        )
        self.assertEqual(
            events["unexpected_http"][0]["url"],
            "https://extension-phone-home.invalid/collect",
        )

        loopback_ws = _FakeWebSocket("ws://127.0.0.1:8789/socket")
        ipv6_ws = _FakeWebSocket("wss://[::1]:8789/socket")
        unexpected_ws = _FakeWebSocket("wss://extension-phone-home.invalid/socket")
        context.websocket_handler(loopback_ws)
        context.websocket_handler(ipv6_ws)
        context.websocket_handler(unexpected_ws)
        self.assertEqual(loopback_ws.connected, 1)
        self.assertEqual(ipv6_ws.connected, 1)
        self.assertIsNone(unexpected_ws.closed)
        self.assertEqual(len(events["unexpected_websockets"]), 1)

    def test_baseline_requires_exact_method_type_and_bounded_occurrence(self) -> None:
        context = _FakeContext()
        events = browser_smoke._install_network_guards(context)
        baseline_url = (
            "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"
        )
        context.http_handler(_FakeRoute(baseline_url, resource_type="script"))
        context.http_handler(_FakeRoute(baseline_url, resource_type="script"))
        context.http_handler(_FakeRoute(baseline_url, method="POST", resource_type="fetch"))
        context.http_handler(_FakeRoute(baseline_url, resource_type="stylesheet"))

        self.assertEqual(
            [event["classification"] for event in events["blocked_http"]],
            ["core-baseline", "unexpected", "unexpected", "unexpected"],
        )
        self.assertEqual(events["blocked_http"][0]["occurrence"], 1)
        self.assertEqual(events["blocked_http"][1]["occurrence"], 2)
        self.assertEqual(
            events["unexpected_http"][0]["method"],
            "GET",
        )
        self.assertEqual(
            events["unexpected_http"][1]["method"],
            "POST",
        )
        self.assertEqual(
            events["unexpected_http"][2]["resource_type"],
            "stylesheet",
        )

    def test_console_error_is_associated_by_location_url(self) -> None:
        with self.assertRaises(browser_smoke.CompatibilityFailure):
            browser_smoke._assert_browser_health(
                case_name="baseline-location-fixture",
                console_errors=[
                    {
                        "text": "Failed to load resource: net::ERR_FAILED",
                        "url": "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js?unexpected=1",
                    }
                ],
                page_errors=[],
                extension_fragments=(),
                network_events={
                    "blocked_http": [
                        {
                            "url": "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js",
                            "classification": "core-baseline",
                            "method": "GET",
                            "resource_type": "script",
                        }
                    ],
                    "unexpected_http": [],
                    "unexpected_websockets": [],
                },
            )

    def test_unexpected_egress_is_a_compatibility_failure(self) -> None:
        with self.assertRaises(browser_smoke.CompatibilityFailure):
            browser_smoke._assert_browser_health(
                case_name="egress-fixture",
                console_errors=[],
                page_errors=[],
                extension_fragments=(),
                network_events={
                    "unexpected_http": [
                        {"url": "https://phone-home.invalid/collect", "classification": "unexpected"}
                    ],
                    "unexpected_websockets": [],
                },
            )

    def test_known_core_abort_noise_is_not_an_extension_pass(self) -> None:
        # The pinned Core emits one ERR_FAILED console line for each CDN
        # request aborted by the browser route and one deterministic
        # service-worker-disabled pageerror.  A console location matching the
        # exact baseline URL is ignored, while an additional runtime signal
        # remains a failure.
        browser_smoke._assert_browser_health(
            case_name="baseline-noise",
            console_errors=[
                {
                    "text": "Failed to load resource: net::ERR_FAILED",
                    "url": "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js",
                }
            ],
            page_errors=[
                "Failed to read the 'serviceWorker' property from 'Navigator': "
                "Service worker is disabled because the context is sandboxed "
                "and lacks the 'allow-same-origin' flag."
            ],
            extension_fragments=(),
            network_events={
                "blocked_http": [
                    {
                        "url": "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js",
                        "classification": "core-baseline",
                    }
                ],
                "unexpected_http": [],
                "unexpected_websockets": [],
            },
        )

    def _run_main_against_fixture(self, fixture_name: str) -> tuple[int, dict]:
        _chromium_available(self)
        fixture_root = Path(__file__).resolve().parent / "fixtures" / fixture_name
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            extension_root = root / "extensions"
            extension_root.mkdir()
            evidence = root / "evidence"
            with _FixtureServer(fixture_root) as server, mock.patch.object(
                browser_smoke,
                "_start_server",
                return_value=(None, None, server.base_url, server.server.server_port),
            ), mock.patch.object(
                browser_smoke,
                "_prepare_normal_bundle",
                return_value="manifest.json",
            ), mock.patch.object(
                browser_smoke,
                "ENTRY_TIMEOUT_MS",
                750,
            ), mock.patch.object(
                sys,
                "argv",
                [
                    "browser_smoke.py",
                    "--core-dir",
                    str(root),
                    "--extension-root",
                    str(extension_root),
                    "--evidence-dir",
                    str(evidence),
                ],
            ):
                code = browser_smoke.main()
            result = json.loads((evidence / "compatibility-results.json").read_text())
            return code, result

    @unittest.skipUnless(
        importlib.util.find_spec("playwright"),
        "Playwright is installed only in the browser-smoke environment",
    )
    def test_missing_entry_timeout_is_compatibility_exit_one(self) -> None:
        code, result = self._run_main_against_fixture("missing-entry")
        self.assertEqual(code, 1)
        self.assertEqual(result["status"], "failed")
        self.assertIn("entry visibility", result["error"])

    @unittest.skipUnless(
        importlib.util.find_spec("playwright"),
        "Playwright is installed only in the browser-smoke environment",
    )
    def test_non_opening_menu_timeout_is_compatibility_exit_one(self) -> None:
        code, result = self._run_main_against_fixture("non-opening-menu")
        self.assertEqual(code, 1)
        self.assertEqual(result["status"], "failed")
        self.assertIn("menu visibility", result["error"])

    def test_real_off_origin_fixture_is_blocked_and_fails(self) -> None:
        """Exercise the guard against a real fixture request in Chromium."""

        _chromium_available(self)
        from playwright.sync_api import sync_playwright
        fixture = (
            Path(__file__).resolve().parent / "fixtures" / "off-origin-egress.js"
        )
        with sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch(headless=True)
            except Exception as exc:  # pragma: no cover - host-dependent
                self.skipTest(f"Chromium is unavailable: {exc}")
            context = browser.new_context(service_workers="block")
            events = browser_smoke._install_network_guards(context)
            page = context.new_page()
            page.goto("data:text/html,<body>fixture</body>")
            page.add_script_tag(path=str(fixture))
            page.wait_for_timeout(250)
            with self.assertRaises(browser_smoke.CompatibilityFailure):
                browser_smoke._assert_browser_health(
                    case_name="off-origin-fixture",
                    console_errors=[],
                    page_errors=[],
                    extension_fragments=(),
                    network_events=events,
                )
            self.assertEqual(len(events["unexpected_http"]), 1)
            context.close()
            browser.close()

    @unittest.skipUnless(
        importlib.util.find_spec("playwright"),
        "Playwright is installed only in the browser-smoke environment",
    )
    def test_real_core_baseline_post_is_unexpected_and_fails(self) -> None:
        """A POST to an exact Core CDN URL is not a baseline request."""

        _chromium_available(self)
        from playwright.sync_api import sync_playwright

        fixture = Path(__file__).resolve().parent / "fixtures" / "core-baseline-post.js"
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(service_workers="block")
            events = browser_smoke._install_network_guards(context)
            page = context.new_page()
            page.goto("data:text/html,<body>fixture</body>")
            page.add_script_tag(path=str(fixture))
            page.wait_for_timeout(500)
            with self.assertRaises(browser_smoke.CompatibilityFailure):
                browser_smoke._assert_browser_health(
                    case_name="core-baseline-post-fixture",
                    console_errors=[],
                    page_errors=[],
                    extension_fragments=(),
                    network_events=events,
                )
            self.assertTrue(events["unexpected_http"])
            self.assertEqual(events["unexpected_http"][0]["method"], "POST")
            context.close()
            browser.close()

    @unittest.skipUnless(
        importlib.util.find_spec("playwright"),
        "Playwright is installed only in the browser-smoke environment",
    )
    def test_real_websocket_fixture_is_mocked_without_external_connect_or_hang(self) -> None:
        """A routed off-origin socket opens as a mocked socket and never dials out."""

        _chromium_available(self)
        from playwright.sync_api import sync_playwright

        fixture = Path(__file__).resolve().parent / "fixtures" / "off-origin-websocket.js"
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(service_workers="block")
            events = browser_smoke._install_network_guards(context)
            page = context.new_page()
            page.goto("data:text/html,<body>fixture</body>")
            page.add_script_tag(path=str(fixture))
            page.wait_for_function(
                "() => window.__hermesCompatibilityWebSocketState === 'open'",
                timeout=2_000,
            )
            self.assertEqual(len(events["unexpected_websockets"]), 1)
            with self.assertRaises(browser_smoke.CompatibilityFailure):
                browser_smoke._assert_browser_health(
                    case_name="off-origin-websocket-fixture",
                    console_errors=[],
                    page_errors=[],
                    extension_fragments=(),
                    network_events=events,
                )
            context.close()
            browser.close()

    @unittest.skipUnless(
        importlib.util.find_spec("playwright"),
        "Playwright is installed only in the browser-smoke environment",
    )
    def test_late_pageerror_fails_positive_and_negative_run_browser_cases(self) -> None:
        """A late pageerror is caught on both browser-case success paths."""

        _chromium_available(self)
        spec = browser_smoke.REFERENCE_ALLOWLIST["mobile-conversations"]
        cases = (
            (
                "late-pageerror-positive",
                "late-pageerror-positive",
                _reference_resources(),
                True,
            ),
            (
                "late-pageerror-negative",
                "late-pageerror-negative",
                ("/extensions/assets/resource-only.js", "/extensions/assets/resource-only.css"),
                False,
            ),
        )
        for case_name, fixture_name, resources, expect_entry in cases:
            with self.subTest(case_name=case_name), _FixtureServer(
                Path(__file__).resolve().parent / "fixtures" / fixture_name
            ) as server:
                with tempfile.TemporaryDirectory(prefix="compatibility-late-error-") as evidence:
                    with self.assertRaises(browser_smoke.CompatibilityFailure):
                        browser_smoke._run_browser_case(
                            base_url=server.base_url,
                            evidence_dir=Path(evidence),
                            case_name=case_name,
                            resource_fragments=resources,
                            expected_entry=spec,
                            expect_entry=expect_entry,
                        )


class ExitClassificationTests(unittest.TestCase):
    def _run_main_with_injected_error(self, error: Exception) -> tuple[int, dict]:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            evidence = root / "evidence"
            extension_root = root / "extensions"
            extension_root.mkdir()
            with mock.patch.object(
                browser_smoke, "_prepare_normal_bundle", side_effect=error
            ), mock.patch.object(
                sys,
                "argv",
                [
                    "browser_smoke.py",
                    "--core-dir",
                    str(root),
                    "--extension-root",
                    str(extension_root),
                    "--evidence-dir",
                    str(evidence),
                ],
            ):
                code = browser_smoke.main()
            result = json.loads((evidence / "compatibility-results.json").read_text())
            return code, result

    def test_compatibility_failure_is_exit_one(self) -> None:
        code, result = self._run_main_with_injected_error(
            browser_smoke.CompatibilityFailure("synthetic incompatible extension")
        )
        self.assertEqual(code, 1)
        self.assertEqual(result["status"], "failed")

    def test_unexpected_assertion_is_harness_error_exit_two(self) -> None:
        code, result = self._run_main_with_injected_error(
            AssertionError("synthetic harness defect")
        )
        self.assertEqual(code, 2)
        self.assertEqual(result["status"], "harness_error")
        self.assertIn("AssertionError", result["traceback"])


if __name__ == "__main__":
    unittest.main()
