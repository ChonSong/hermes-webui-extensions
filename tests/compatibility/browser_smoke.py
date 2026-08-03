#!/usr/bin/env python3
"""Browser compatibility smoke for one explicitly allow-listed extension.

This test boots a real Hermes WebUI ``server.py`` from a separately checked-out
Core repository, injects the merged ``mobile-conversations`` extension, and
drives its phone-width entry in headless Chromium.  A resource-only fixture is
also loaded: the fixture script and stylesheet must be served, but the test
deliberately requires the extension-owned entry and records the expected
failure when that entry is absent.  This keeps a green result from meaning
only "the asset URL returned 200".

The allowlist is intentionally narrow in the first stage.  Add another
``ReferenceSpec`` only when its merged entry has a stable, extension-owned
observable (id/ARIA contract) and a separate browser scenario.  This script
does not claim coverage for all changed extensions.

Exit codes:
  0 - reference entry passed and the negative case was correctly detected.
  1 - compatibility assertion failed.
  2 - environment/setup failure (missing Core checkout or Playwright).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "mobile-conversations-resource-only"
MOBILE_VIEWPORT = {"width": 390, "height": 844}
HEALTH_TIMEOUT_SECONDS = 30
SERVER_START_ATTEMPTS = 5
ENTRY_TIMEOUT_MS = 15_000
NEGATIVE_ENTRY_TIMEOUT_MS = 4_000


@dataclass(frozen=True)
class ReferenceSpec:
    """Browser contract for one merged extension in the first-stage allowlist."""

    extension_id: str
    entry_selector: str
    entry_data_attribute: tuple[str, str]
    entry_aria_label: str
    script_fragment: str
    stylesheet_fragment: str
    runtime_global: str
    runtime_version: str


REFERENCE_ALLOWLIST: dict[str, ReferenceSpec] = {
    "mobile-conversations": ReferenceSpec(
        extension_id="mobile-conversations",
        # This id and the aria attributes are owned by the extension.  The test
        # intentionally does not use a private Core selector as its oracle.
        entry_selector="#mobileConversationsBtn",
        entry_data_attribute=("data-hwx-mobile-conversations", "1"),
        entry_aria_label="Open conversations",
        script_fragment="/extensions/mobile-conversations/assets/mobile-conversations.js",
        stylesheet_fragment="/extensions/mobile-conversations/assets/mobile-conversations.css",
        runtime_global="HermesMobileConversationsExtension",
        runtime_version="0.1.1",
    )
}


class SetupFailure(RuntimeError):
    """The smoke environment cannot be constructed."""


class CompatibilityFailure(RuntimeError):
    """The browser compatibility contract was not met."""


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--core-dir",
        default=os.environ.get("HERMES_CORE_DIR", ""),
        help="path to an independent Hermes WebUI Core checkout (or HERMES_CORE_DIR)",
    )
    parser.add_argument(
        "--extension-root",
        default=os.environ.get("HERMES_EXTENSION_ROOT", str(REPO_ROOT / "extensions")),
        help="extension source root (default: this checkout's extensions/)",
    )
    parser.add_argument(
        "--extension-id",
        default="mobile-conversations",
        help="allow-listed reference extension id",
    )
    parser.add_argument(
        "--evidence-dir",
        default=os.environ.get(
            "COMPATIBILITY_EVIDENCE_DIR",
            str(REPO_ROOT / ".compatibility-evidence"),
        ),
        help="directory for logs, screenshots, and results JSON",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("HERMES_COMPATIBILITY_PORT", "0") or "0"),
        help="optional fixed non-production port; 0 chooses a free ephemeral port",
    )
    return parser.parse_args()


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_health(base_url: str, proc: subprocess.Popen[str], timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=2) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.25)
    return False


def _terminate(proc: subprocess.Popen[str] | None, log_file: Any | None) -> None:
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
    if log_file is not None:
        log_file.flush()
        log_file.close()


def _sanitized_environment(
    *,
    state_root: Path,
    agent_stub: Path,
    extension_root: Path,
    manifest_relative: str,
    port: int,
) -> dict[str, str]:
    env = os.environ.copy()
    for key in list(env):
        if key.endswith("_API_KEY") or key in {
            "API_SERVER_KEY",
            "HERMES_API_KEY",
            "HERMES_WEBUI_PASSWORD",
            "HERMES_WEBUI_AUTH",
        }:
            env.pop(key, None)
    for key in (
        "HERMES_WEBUI_EXTENSION_SCRIPT_URLS",
        "HERMES_WEBUI_EXTENSION_STYLESHEET_URLS",
        "HERMES_WEBUI_EXTENSION_MANIFEST",
    ):
        env.pop(key, None)
    hermes_home = state_root / "hermes-home"
    env.update(
        {
            "HERMES_WEBUI_HOST": "127.0.0.1",
            "HERMES_WEBUI_PORT": str(port),
            "HERMES_WEBUI_STATE_DIR": str(state_root / "webui-state"),
            "HERMES_HOME": str(hermes_home),
            "HERMES_BASE_HOME": str(hermes_home),
            "HERMES_CONFIG_PATH": str(hermes_home / "config.yaml"),
            "HERMES_WEBUI_DEFAULT_WORKSPACE": str(state_root / "workspace"),
            "HERMES_WEBUI_SKIP_ONBOARDING": "1",
            "HERMES_WEBUI_AGENT_DIR": str(agent_stub),
            "HERMES_WEBUI_EXTENSION_DIR": str(extension_root),
            "HERMES_WEBUI_EXTENSION_MANIFEST": manifest_relative,
            # Core's own smoke uses this switch to keep server-side probes
            # local.  The browser never receives credentials or model config.
            "HERMES_WEBUI_TEST_NETWORK_BLOCK": "1",
            "NO_PROXY": "127.0.0.1,localhost",
            "no_proxy": "127.0.0.1,localhost",
        }
    )
    return env


def _start_server(
    *,
    core_dir: Path,
    extension_root: Path,
    manifest_relative: str,
    state_root: Path,
    log_path: Path,
    requested_port: int,
) -> tuple[subprocess.Popen[str], Any, str, int]:
    server_py = core_dir / "server.py"
    if not server_py.is_file():
        raise SetupFailure(f"Core server.py not found: {server_py}")

    agent_stub = state_root / "agent-stub"
    agent_stub.mkdir(parents=True, exist_ok=True)
    (agent_stub / "run_agent.py").write_text(
        '"""Empty agent stub: the compatibility gate does not send a chat."""\n',
        encoding="utf-8",
    )
    (state_root / "workspace").mkdir(parents=True, exist_ok=True)

    last_tail = ""
    for attempt in range(SERVER_START_ATTEMPTS):
        port = requested_port if requested_port else _find_free_port()
        env = _sanitized_environment(
            state_root=state_root,
            agent_stub=agent_stub,
            extension_root=extension_root,
            manifest_relative=manifest_relative,
            port=port,
        )
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("w", encoding="utf-8")
        proc = subprocess.Popen(
            [sys.executable, str(server_py)],
            cwd=str(core_dir),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        base_url = f"http://127.0.0.1:{port}"
        if _wait_for_health(base_url, proc, HEALTH_TIMEOUT_SECONDS):
            return proc, log_file, base_url, port
        _terminate(proc, log_file)
        try:
            last_tail = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        except OSError:
            last_tail = ""
        if requested_port:
            break

    detail = f"; server log tail:\n{last_tail}" if last_tail else ""
    raise SetupFailure(f"Core server did not become healthy{detail}")


def _is_benign_core_console(text: str, extension_fragments: tuple[str, ...]) -> bool:
    """Ignore only known shell noise, never an error mentioning our assets."""
    lowered = text.lower()
    if any(fragment.lower() in lowered for fragment in extension_fragments):
        return False
    return any(
        marker in lowered
        for marker in (
            "favicon",
            "manifest.json",
            "serviceworker",
            "sw.js",
            "the server responded with a status of 404",
            "cdn.jsdelivr.net",
        )
    )


def _record_screenshot(page: Any, path: Path) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path), full_page=True)
    except Exception:
        # A screenshot is useful evidence, not a second failure mode when the
        # browser has already crashed or closed.
        pass


def _run_browser_case(
    *,
    base_url: str,
    evidence_dir: Path,
    case_name: str,
    resource_fragments: tuple[str, ...],
    expected_entry: ReferenceSpec,
    expect_entry: bool,
) -> dict[str, Any]:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SetupFailure(
            "Playwright is required; install tests/compatibility/requirements.txt"
        ) from exc

    responses: list[dict[str, Any]] = []
    request_failures: list[str] = []
    console_errors: list[str] = []
    page_errors: list[str] = []
    screenshot_path = evidence_dir / f"{case_name}.png"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(viewport=MOBILE_VIEWPORT, is_mobile=True)
        page = context.new_page()

        def on_response(response: Any) -> None:
            if any(fragment in response.url for fragment in resource_fragments):
                responses.append({"url": response.url, "status": response.status})

        def on_request_failed(request: Any) -> None:
            if any(fragment in request.url for fragment in resource_fragments):
                request_failures.append(f"{request.url}: {request.failure}")

        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        try:
            page.goto(f"{base_url}/", wait_until="domcontentloaded", timeout=30_000)
            try:
                page.wait_for_load_state("networkidle", timeout=8_000)
            except PlaywrightTimeoutError:
                # Core has optional CDN assets; the extension contract below is
                # observed after DOMContentLoaded and has its own timeout.
                pass
            page.wait_for_timeout(1_000)

            for fragment in resource_fragments:
                try:
                    page.wait_for_function(
                        "fragment => performance.getEntriesByType('resource').some(entry => entry.name.includes(fragment))",
                        arg=fragment,
                        timeout=ENTRY_TIMEOUT_MS,
                    )
                except PlaywrightTimeoutError as exc:
                    raise CompatibilityFailure(
                        f"{case_name}: injected resource was not requested: {fragment}"
                    ) from exc
            failed_resources = [
                item for item in responses if item["status"] >= 400
            ]
            if request_failures or failed_resources:
                raise CompatibilityFailure(
                    f"{case_name}: extension resource failed: "
                    f"{request_failures or failed_resources}"
                )

            meaningful_console_errors = [
                text
                for text in console_errors
                if not _is_benign_core_console(text, resource_fragments)
            ]
            if meaningful_console_errors or page_errors:
                raise CompatibilityFailure(
                    f"{case_name}: browser runtime errors: "
                    f"console={meaningful_console_errors!r}, page={page_errors!r}"
                )

            # The extension README names `.messages-shell` as its host.  Wait
            # for that real Core host before evaluating either positive or
            # negative entry behavior; otherwise a fast timeout could mistake
            # an app that is still booting for a missing extension entry.
            page.locator(".messages-shell").wait_for(
                state="visible", timeout=ENTRY_TIMEOUT_MS
            )

            if not expect_entry:
                try:
                    page.wait_for_function(
                        "() => window.__hermesCompatibilityResourceOnlyLoaded === true",
                        timeout=ENTRY_TIMEOUT_MS,
                    )
                except PlaywrightTimeoutError as exc:
                    raise CompatibilityFailure(
                        f"{case_name}: resource-only script was served but did not execute"
                    ) from exc
                try:
                    page.locator(expected_entry.entry_selector).wait_for(
                        state="visible", timeout=NEGATIVE_ENTRY_TIMEOUT_MS
                    )
                except PlaywrightTimeoutError:
                    _record_screenshot(page, screenshot_path)
                    return {
                        "status": "expected_failure_detected",
                        "resource_urls": [item["url"] for item in responses],
                        "entry_selector": expected_entry.entry_selector,
                        "screenshot": str(screenshot_path),
                    }
                raise CompatibilityFailure(
                    f"{case_name}: resource-only fixture unexpectedly rendered "
                    f"{expected_entry.entry_selector}"
                )

            entry = page.locator(expected_entry.entry_selector)
            entry.wait_for(state="visible", timeout=ENTRY_TIMEOUT_MS)
            marker_name, marker_value = expected_entry.entry_data_attribute
            if entry.get_attribute(marker_name) != marker_value:
                raise CompatibilityFailure(
                    f"{case_name}: extension-owned data marker {marker_name}={marker_value!r} is missing"
                )
            if entry.get_attribute("aria-label") != expected_entry.entry_aria_label:
                raise CompatibilityFailure(
                    f"{case_name}: entry aria-label changed; expected "
                    f"{expected_entry.entry_aria_label!r}"
                )
            runtime = page.evaluate(
                "globalName => { const value = window[globalName]; "
                "return value ? {version: value.version} : null; }",
                expected_entry.runtime_global,
            )
            if runtime != {"version": expected_entry.runtime_version}:
                raise CompatibilityFailure(
                    f"{case_name}: extension runtime marker mismatch: {runtime!r}"
                )

            # Exercise an extension-owned interaction and its own ARIA menu. No
            # Core-only class/id is used as the pass/fail oracle.
            entry.click(button="right", timeout=ENTRY_TIMEOUT_MS)
            menu = page.locator('[role="menu"][aria-label="Conversation shortcuts"]')
            menu.wait_for(state="visible", timeout=ENTRY_TIMEOUT_MS)
            menu_items = menu.locator('[role="menuitem"]')
            if menu_items.count() != 4:
                raise CompatibilityFailure(
                    f"{case_name}: shortcut menu item count was {menu_items.count()}, expected 4"
                )
            expected_labels = {
                "New conversation",
                "Open sidebar",
                "Go to top",
                "Go to last message",
            }
            labels = {text.strip() for text in menu_items.all_text_contents()}
            if labels != expected_labels:
                raise CompatibilityFailure(
                    f"{case_name}: shortcut labels changed: {sorted(labels)!r}"
                )
            page.keyboard.press("Escape")
            _record_screenshot(page, screenshot_path)
            return {
                "status": "passed",
                "resource_urls": [item["url"] for item in responses],
                "entry_selector": expected_entry.entry_selector,
                "entry_aria_label": expected_entry.entry_aria_label,
                "runtime": runtime,
                "screenshot": str(screenshot_path),
            }
        except Exception:
            _record_screenshot(page, screenshot_path)
            raise
        finally:
            context.close()
            browser.close()


def _prepare_normal_bundle(extension_root: Path, target_root: Path, spec: ReferenceSpec) -> str:
    source_dir = extension_root / spec.extension_id
    if not source_dir.is_dir():
        raise SetupFailure(f"reference extension directory not found: {source_dir}")
    shutil.copytree(source_dir, target_root / spec.extension_id)
    manifest = target_root / spec.extension_id / "manifest.json"
    if not manifest.is_file():
        raise SetupFailure(f"reference manifest not found: {manifest}")
    for relative in (
        "assets/mobile-conversations.js",
        "assets/mobile-conversations.css",
    ):
        if not (target_root / spec.extension_id / relative).is_file():
            raise SetupFailure(f"reference asset not found: {source_dir / relative}")
    return f"{spec.extension_id}/manifest.json"


def _prepare_negative_bundle(target_root: Path) -> str:
    if not FIXTURE_ROOT.is_dir():
        raise SetupFailure(f"compatibility fixture directory not found: {FIXTURE_ROOT}")
    shutil.copytree(FIXTURE_ROOT, target_root, dirs_exist_ok=True)
    manifest = target_root / "manifest.json"
    if not manifest.is_file():
        raise SetupFailure(f"resource-only fixture manifest not found: {manifest}")
    return "manifest.json"


def main() -> int:
    args = _parse_args()
    evidence_dir = Path(args.evidence_dir).expanduser().resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {
        "extension_allowlist": sorted(REFERENCE_ALLOWLIST),
        "extension_id": args.extension_id,
        "viewport": MOBILE_VIEWPORT,
        "cases": {},
    }
    results_path = evidence_dir / "compatibility-results.json"

    try:
        spec = REFERENCE_ALLOWLIST.get(args.extension_id)
        if spec is None:
            raise SetupFailure(
                f"unsupported extension id {args.extension_id!r}; "
                f"allowlist is {sorted(REFERENCE_ALLOWLIST)!r}"
            )
        core_dir = Path(args.core_dir).expanduser().resolve()
        extension_root = Path(args.extension_root).expanduser().resolve()
        if not core_dir.is_dir():
            raise SetupFailure(
                "HERMES_CORE_DIR/--core-dir must point to an independent Hermes WebUI checkout"
            )
        if not extension_root.is_dir():
            raise SetupFailure(f"extension root not found: {extension_root}")

        with tempfile.TemporaryDirectory(prefix="hermes-extension-compat-") as temp:
            temp_root = Path(temp)
            normal_root = temp_root / "normal-bundle"
            negative_root = temp_root / "resource-only-bundle"
            normal_root.mkdir()
            negative_root.mkdir()
            normal_manifest = _prepare_normal_bundle(extension_root, normal_root, spec)
            negative_manifest = _prepare_negative_bundle(negative_root)

            cases = (
                (
                    "normal-reference",
                    normal_root,
                    normal_manifest,
                    (spec.script_fragment, spec.stylesheet_fragment),
                    True,
                ),
                (
                    "resource-only-negative",
                    negative_root,
                    negative_manifest,
                    ("/extensions/assets/resource-only.js", "/extensions/assets/resource-only.css"),
                    False,
                ),
            )
            for case_name, bundle_root, manifest_relative, resources, expect_entry in cases:
                state_root = temp_root / f"state-{case_name}"
                log_path = evidence_dir / f"{case_name}-server.log"
                proc = None
                log_file = None
                try:
                    proc, log_file, base_url, port = _start_server(
                        core_dir=core_dir,
                        extension_root=bundle_root,
                        manifest_relative=manifest_relative,
                        state_root=state_root,
                        log_path=log_path,
                        requested_port=args.port,
                    )
                    case_result = _run_browser_case(
                        base_url=base_url,
                        evidence_dir=evidence_dir,
                        case_name=case_name,
                        resource_fragments=resources,
                        expected_entry=spec,
                        expect_entry=expect_entry,
                    )
                    case_result["port"] = port
                    results["cases"][case_name] = case_result
                    _write_json(results_path, results)
                finally:
                    _terminate(proc, log_file)
        if results["cases"].get("normal-reference", {}).get("status") != "passed":
            raise CompatibilityFailure("normal-reference did not pass")
        if (
            results["cases"].get("resource-only-negative", {}).get("status")
            != "expected_failure_detected"
        ):
            raise CompatibilityFailure("resource-only-negative did not detect the missing entry")
        _write_json(results_path, results)
        print("EXTENSION COMPATIBILITY PASSED")
        print(f"reference={spec.extension_id} viewport={MOBILE_VIEWPORT}")
        print("normal-reference=passed resource-only-negative=expected_failure_detected")
        print(f"evidence={evidence_dir}")
        return 0
    except SetupFailure as exc:
        results["status"] = "setup_failure"
        results["error"] = str(exc)
        _write_json(results_path, results)
        print(f"SETUP FAILURE: {exc}", file=sys.stderr)
        print(f"evidence={evidence_dir}", file=sys.stderr)
        return 2
    except (CompatibilityFailure, Exception) as exc:
        results["status"] = "failed"
        results["error"] = str(exc)
        _write_json(results_path, results)
        print(f"EXTENSION COMPATIBILITY FAILED: {exc}", file=sys.stderr)
        print(f"evidence={evidence_dir}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
