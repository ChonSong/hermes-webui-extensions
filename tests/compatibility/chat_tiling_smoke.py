#!/usr/bin/env python3
"""Real-browser geometry smoke for the Chat Tiling extension.

The JSDOM unit suite (``scripts/test-chat-tiling.mjs``) proves state-machine
correctness but cannot prove the *interaction geometry* that the overlay
architecture depends on:

1. **Hit-testing pass-through** — the focused tile is a transparent window;
   a click on the focused tile's body must reach the live ``#msgInner``
   beneath the overlay, not be swallowed by the grid container.
2. **Scroll geometry** — ``#messages`` is Core's single scroll owner and must
   remain scrollable while the tile overlay is active; the overlay must not
   capture the wheel.
3. **Real Core lifecycle** — two-phase navigation, same-session no-op,
   full-grid veto, exact focus ownership, immediate busy close, and desktop
   drag-region exemption. Busy stream state is a synthetic boundary fixture.
4. **Failed-focus rollback** — when ``loadSession`` rejects, ``focusTile``
   rolls back to the outgoing session and the visual state (focused class,
   tile count, ``#msgInner`` placement) must be clean: no half-focused tile,
   no stuck overlay.

This smoke boots a real Hermes WebUI ``server.py`` from a separately
checked-out Core repository, injects the merged ``chat-tiling`` extension,
and drives the toolbar in headless Chromium.  It uses the shared
``browser_smoke`` harness for server lifecycle, network guards, and the
deny-by-default egress policy.

Exit codes:
  0 - all geometry cases passed.
  1 - a geometry assertion failed.
  2 - setup failure or unexpected harness/driver exception (with traceback).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import os
import shutil
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any

try:
    from browser_smoke import (
        CompatibilityFailure,
        SetupFailure,
        _assert_browser_health,
        _install_network_guards,
        _record_screenshot,
        _start_server,
        _sanitized_environment,
        _terminate,
        _write_json,
    )
except ModuleNotFoundError:  # pragma: no cover - supports module execution.
    from tests.compatibility.browser_smoke import (
        CompatibilityFailure,
        SetupFailure,
        _assert_browser_health,
        _install_network_guards,
        _record_screenshot,
        _start_server,
        _sanitized_environment,
        _terminate,
        _write_json,
    )


REPO_ROOT = Path(__file__).resolve().parents[2]
EXTENSION_ID = "chat-tiling"
EXTENSION_RESOURCES: tuple[str, ...] = (
    f"/extensions/{EXTENSION_ID}/assets/tiling.js",
)
TOOLBAR_SELECTOR = "#ext-tiling-toolbar"
TILE_GRID_SELECTOR = "#ext-tile-grid"
TILE_SELECTOR = ".ext-tile"
FOCUSED_TILE_SELECTOR = ".ext-tile--focused"
MESSAGES_SELECTOR = "#messages"
MSG_INNER_SELECTOR = "#msgInner"
SPLIT_2_SELECTOR = '[data-layout="2"]'
ENTRY_TIMEOUT_MS = 15_000


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--core-dir",
        default=os.environ.get("HERMES_CORE_DIR", ""),
        help="independent Hermes WebUI Core checkout (or HERMES_CORE_DIR)",
    )
    parser.add_argument(
        "--extension-root",
        default=os.environ.get("HERMES_EXTENSION_ROOT", str(REPO_ROOT / "extensions")),
        help="extension source root (default: this checkout's extensions/)",
    )
    parser.add_argument(
        "--evidence-dir",
        default=os.environ.get(
            "COMPATIBILITY_EVIDENCE_DIR",
            str(REPO_ROOT / ".compatibility-evidence"),
        ),
        help="directory for screenshots and results JSON",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("HERMES_COMPATIBILITY_PORT", "0") or "0"),
        help="optional fixed non-production port; 0 chooses a free ephemeral port",
    )
    return parser.parse_args()


def _prepare_extension_bundle(extension_root: Path, target_root: Path) -> str:
    """Copy the chat-tiling extension into a temp bundle and return the
    manifest-relative path Core expects."""
    source_dir = extension_root / EXTENSION_ID
    if not source_dir.is_dir():
        raise SetupFailure(f"extension directory not found: {source_dir}")
    shutil.copytree(source_dir, target_root / EXTENSION_ID)
    manifest = target_root / EXTENSION_ID / "manifest.json"
    if not manifest.is_file():
        raise SetupFailure(f"extension manifest not found: {manifest}")
    js_asset = target_root / EXTENSION_ID / "assets" / "tiling.js"
    if not js_asset.is_file():
        raise SetupFailure(f"extension asset not found: {js_asset}")
    return f"{EXTENSION_ID}/manifest.json"


def _boot_page(page: Any, base_url: str) -> None:
    page.goto(f"{base_url}/", wait_until="domcontentloaded", timeout=30_000)
    try:
        page.wait_for_load_state("networkidle", timeout=8_000)
    except Exception:
        pass
    # Wait for the extension resource to be requested (proves the extension
    # script has been loaded by Core).
    _wait_for_extension_resource(page, base_url)
    # Wait a moment for extension to fully initialize.
    page.wait_for_timeout(500)


def _wait_for_extension_resource(page: Any, base_url: str) -> None:
    """Wait until the browser has requested the extension script."""
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    try:
        page.wait_for_function(
            "fragment => performance.getEntriesByType('resource').some(entry => entry.name.includes(fragment))",
            arg=EXTENSION_RESOURCES[0],
            timeout=ENTRY_TIMEOUT_MS,
        )
    except PlaywrightTimeoutError as exc:
        raise CompatibilityFailure(
            f"chat-tiling: extension resource was not requested: {EXTENSION_RESOURCES[0]}"
        ) from exc


def _activate_grid(page: Any, cols: int = 2, rows: int = 1) -> None:
    """Activate the tile grid through the REAL user entry point (the toolbar).

    Panel gating must leave the toolbar visible on the chat view. If it is
    hidden the feature is unreachable for users, so this FAILS instead of
    falling back to ``window.showGridExt()`` — a programmatic fallback lets the
    smoke pass while the toolbar is permanently ``display:none``.
    """
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    toolbar = page.locator(TOOLBAR_SELECTOR)
    try:
        toolbar.wait_for(state="visible", timeout=ENTRY_TIMEOUT_MS)
    except PlaywrightTimeoutError as exc:
        raise CompatibilityFailure(
            "chat-tiling: toolbar is not visible on the chat view — the user-facing "
            "entry point is hidden, so the feature cannot be reached at all"
        ) from exc

    button = toolbar.locator(f'[aria-label="Split in {cols * rows}"]')
    try:
        button.wait_for(state="visible", timeout=ENTRY_TIMEOUT_MS)
        button.click(timeout=5_000)
    except Exception as exc:
        raise CompatibilityFailure(
            f"chat-tiling: could not click the {cols * rows}-tile toolbar button: {exc}"
        ) from exc

    # Wait for the grid overlay to appear.
    try:
        page.locator(TILE_GRID_SELECTOR).wait_for(
            state="attached", timeout=ENTRY_TIMEOUT_MS
        )
    except PlaywrightTimeoutError as exc:
        raise CompatibilityFailure(
            "chat-tiling: tile grid overlay did not appear"
        ) from exc


def _assert_tile_geometry(page: Any, case_name: str) -> list[dict[str, float]]:
    """Tiles must stretch into distinct cells, not stack at one origin.

    The shipped regression had ``position:absolute`` on tiles inside a CSS
    grid, which made them overlap at a single origin at collapsed sizes.
    """
    boxes = page.evaluate(
        """() => Array.from(document.querySelectorAll('.ext-tile')).map(el => {
             const r = el.getBoundingClientRect();
             return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
           })"""
    )
    if not boxes:
        raise CompatibilityFailure(f"{case_name}: no .ext-tile elements found")
    origins = {(b["x"], b["y"]) for b in boxes}
    if len(origins) != len(boxes):
        raise CompatibilityFailure(
            f"{case_name}: tiles overlap at a shared origin instead of tiling: {boxes}"
        )
    collapsed = [b for b in boxes if b["w"] < 50 or b["h"] < 50]
    if collapsed:
        raise CompatibilityFailure(
            f"{case_name}: tiles collapsed to unusable size: {collapsed}"
        )
    return boxes


# ---------------------------------------------------------------------------
# Geometry case 1: focused tile click pass-through
# ---------------------------------------------------------------------------

def _test_focused_tile_click_pass_through(
    *,
    page: Any,
    console_errors: list[dict[str, str]],
    page_errors: list[str],
    network_events: dict[str, list[dict[str, Any]]],
    evidence_dir: Path,
) -> dict[str, Any]:
    """Click on the focused tile's body; the event must reach #msgInner.

    The focused tile has ``pointer-events: none`` on the tile root and the
    body is transparent, so a click at the center of the focused tile's body
    must land on ``#msgInner`` (which sits beneath the overlay in the real
    Core DOM).  We install a one-shot click listener on ``#msgInner`` *before*
    clicking and assert it fired.
    """
    case_name = "focused-tile-click-pass-through"

    # Install a click listener on #msgInner (and fallback on #messages) to
    # detect pass-through.  The grid overlay has pointer-events: none, so a
    # click at its center should reach #msgInner underneath.
    page.evaluate(
        """() => {
          window.__chatTilingClickThrough = 0;
          window.__chatTilingClickThroughMessages = 0;
          const mi = document.getElementById('msgInner');
          if (mi) {
            mi.addEventListener('click', function handler(e) {
              window.__chatTilingClickThrough++;
              mi.removeEventListener('click', handler);
            }, { once: true });
          }
          const msgs = document.getElementById('messages');
          if (msgs) {
            msgs.addEventListener('click', function handler(e) {
              window.__chatTilingClickThroughMessages++;
              msgs.removeEventListener('click', handler);
            }, { once: true });
          }
          return true;
        }"""
    )

    # Tiles must tile into distinct cells, not stack at a single origin.
    boxes = _assert_tile_geometry(page, case_name)

    if not page.evaluate("() => !!document.getElementById('msgInner')"):
        raise CompatibilityFailure(f"{case_name}: #msgInner missing from the live Core DOM")

    # Click the centre of the FOCUSED tile's body. The focused tile is a
    # transparent window (pointer-events:none, its own snapshot hidden), so the
    # event must land on the live #msgInner beneath it — not merely on
    # #messages, which any click anywhere in the transcript would satisfy.
    focused_body = page.locator(".ext-tile--focused .ext-tile-body")
    focused_body.wait_for(state="attached", timeout=ENTRY_TIMEOUT_MS)
    bbox = focused_body.bounding_box()
    if bbox is None:
        raise CompatibilityFailure(
            f"{case_name}: could not get the focused tile body bounding box"
        )

    # Click a point that lies inside BOTH the focused tile body and the live
    # #msgInner beneath it. Using the tile's own centre assumes a geometry we do
    # not control (Core's transcript may begin below the overlay's top edge).
    target = page.evaluate(
        """() => {
             const body = document.querySelector('.ext-tile--focused .ext-tile-body');
             const mi = document.getElementById('msgInner');
             if (!body || !mi) return null;
             const a = body.getBoundingClientRect();
             const b = mi.getBoundingClientRect();
             const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
             const x2 = Math.min(a.right, b.right), y2 = Math.min(a.bottom, b.bottom);
             const rect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
             if (x2 <= x1 || y2 <= y1) return { overlap: false, body: rect(a), inner: rect(b) };
             return { overlap: true, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
           }"""
    )
    if not target or not target.get("overlap"):
        _record_screenshot(page, evidence_dir / f"{case_name}.png")
        raise CompatibilityFailure(
            f"{case_name}: the focused tile body does not overlap the live #msgInner "
            f"region, so click pass-through cannot be observed: {target}"
        )

    page.mouse.click(target["x"], target["y"])

    # Give the event time to propagate (500ms for CI stability).
    page.wait_for_timeout(500)

    # The click must have reached #msgInner specifically.
    clicks = page.evaluate("() => window.__chatTilingClickThrough || 0")
    if clicks < 1:
        _record_screenshot(page, evidence_dir / f"{case_name}.png")
        raise CompatibilityFailure(
            f"{case_name}: click within the focused tile body did not reach "
            f"#msgInner (clicks={clicks})"
        )

    _record_screenshot(page, evidence_dir / f"{case_name}.png")
    _assert_browser_health(
        case_name=case_name,
        console_errors=console_errors,
        page_errors=page_errors,
        extension_fragments=EXTENSION_RESOURCES,
        network_events=network_events,
    )
    return {"status": "passed", "click_through_count": clicks}


# ---------------------------------------------------------------------------
# Geometry case 2: #messages scrolls with overlay active
# ---------------------------------------------------------------------------

def _test_messages_scrolls_with_overlay(
    *,
    page: Any,
    console_errors: list[dict[str, str]],
    page_errors: list[str],
    network_events: dict[str, list[dict[str, Any]]],
    evidence_dir: Path,
) -> dict[str, Any]:
    """#messages must remain scrollable while the tile overlay is active.

    The overlay (``#ext-tile-grid``) is ``pointer-events: none`` and covers
    ``#messages`` absolutely.  A wheel event on the overlay must propagate to
    ``#messages`` and scroll it.

    Fix 2: Use Playwright's page.mouse.wheel() over the live region and require
    actual scrollHeight > clientHeight plus changed scrollTop. The real Core
    session should have content, making #messages scrollable.
    """
    case_name = "messages-scrolls-with-overlay"

    # Ensure there's enough content in #messages to be scrollable
    page.evaluate(
        """() => {
          const m = document.getElementById('messages');
          if (!m) return;
          // Add enough content to make #messages scrollable
          for (let i = 0; i < 50; i++) {
            const d = document.createElement('div');
            d.textContent = 'scroll filler line ' + i;
            d.style.minHeight = '40px';
            m.appendChild(d);
          }
        }"""
    )

    # Record initial scroll state.
    initial = page.evaluate(
        """() => {
          const m = document.getElementById('messages');
          return m ? { scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight } : null;
        }"""
    )

    if initial is None:
        raise CompatibilityFailure(f"{case_name}: #messages not found")

    # Check if scrollable
    scrollable = initial["scrollHeight"] > initial["clientHeight"]
    if not scrollable:
        _record_screenshot(page, evidence_dir / f"{case_name}.png")
        raise CompatibilityFailure(
            f"{case_name}: #messages not scrollable (scrollHeight={initial['scrollHeight']}, clientHeight={initial['clientHeight']})"
        )

    # Use Playwright's real mouse wheel over #messages center
    messages_box = page.locator(MESSAGES_SELECTOR).bounding_box()
    if messages_box is None:
        raise CompatibilityFailure(f"{case_name}: could not get bounding box of #messages")

    wheel_x = messages_box["x"] + messages_box["width"] / 2
    wheel_y = messages_box["y"] + messages_box["height"] / 2

    # The overlay must be anchored to the non-scrolling shell: scrolling the
    # transcript may move #messages' content but must NOT move the grid.
    grid_before = page.locator(TILE_GRID_SELECTOR).bounding_box()

    # Move mouse to center of #messages and scroll down
    page.mouse.move(wheel_x, wheel_y)
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(500)

    grid_after = page.locator(TILE_GRID_SELECTOR).bounding_box()
    if grid_before is not None and grid_after is not None:
        drift = abs(grid_after["y"] - grid_before["y"])
        if drift > 1:
            _record_screenshot(page, evidence_dir / f"{case_name}.png")
            raise CompatibilityFailure(
                f"{case_name}: tile overlay scrolled with the transcript "
                f"(grid y {grid_before['y']} -> {grid_after['y']})"
            )

    # Check scrollTop actually changed
    after = page.evaluate(
        """() => {
          const m = document.getElementById('messages');
          return m ? { scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight } : null;
        }"""
    )

    scroll_changed = (
        after is not None
        and after["scrollTop"] != initial["scrollTop"]
    )

    if not scroll_changed:
        _record_screenshot(page, evidence_dir / f"{case_name}.png")
        raise CompatibilityFailure(
            f"{case_name}: #messages did not scroll after page.mouse.wheel() "
            f"(initial={initial}, after={after})"
        )

    # After this point, `after` is guaranteed non-None (scroll_changed is True).
    after_scroll = after["scrollTop"]
    initial_scroll = initial["scrollTop"]

    _record_screenshot(page, evidence_dir / f"{case_name}.png")
    _assert_browser_health(
        case_name=case_name,
        console_errors=console_errors,
        page_errors=page_errors,
        extension_fragments=EXTENSION_RESOURCES,
        network_events=network_events,
    )
    return {
        "status": "passed",
        "scroll_changed": scroll_changed,
        "scroll_top_delta": after["scrollTop"] - initial["scrollTop"],
        "scrollable": scrollable,
    }


# ---------------------------------------------------------------------------
# Geometry case 3: failed-focus rollback leaves clean visual state
# ---------------------------------------------------------------------------

def _test_failed_focus_rollback(
    *, page: Any, console_errors: list, page_errors: list,
    network_events: dict, evidence_dir: Path,
) -> dict[str, Any]:
    state = page.evaluate("""async () => {
      await hideGridExt();
      await loadSession('tiling-compat-A', {skipExtHooks:true, force:true});
      await showGridExt(2, 1);
      await loadSession('tiling-compat-B');
      const T = chatTilingState;
      const a = T.tiles.find(t => t.sid === 'tiling-compat-A');
      const b = T.tiles.find(t => t.sid === 'tiling-compat-B');
      await focusTileExt(a.id);
      const realLoad = window.loadSession;
      const calls = [];
      window.loadSession = (sid, opts) => {
        calls.push({sid, skipExtHooks:!!(opts && opts.skipExtHooks)});
        if (sid === b.sid) return Promise.reject(new Error('intentional rollback test failure'));
        return realLoad(sid, opts);
      };
      try { await focusTileExt(b.id); }
      finally { window.loadSession = realLoad; }
      return {active:T.activeId, expected:a.id, core:S.session.session_id,
        expectedSid:a.sid, count:T.tiles.length,
        focused:a.el.classList.contains('ext-tile--focused'),
        targetFocused:b.el.classList.contains('ext-tile--focused'),
        msgParent:document.getElementById('msgInner').parentElement.id, calls};
    }""")
    _write_json(evidence_dir / "failed-focus-rollback.json", state)
    if not (state["active"] == state["expected"] and state["core"] == state["expectedSid"]
            and state["count"] == 2 and state["focused"] and not state["targetFocused"]
            and state["msgParent"] == "messages"
            and len(state["calls"]) == 2 and all(c["skipExtHooks"] for c in state["calls"])):
        raise CompatibilityFailure(f"failed-focus-rollback: {state!r}")
    _record_screenshot(page, evidence_dir / "failed-focus-rollback.png")
    _assert_browser_health(case_name="failed-focus-rollback", console_errors=console_errors,
        page_errors=page_errors, extension_fragments=EXTENSION_RESOURCES, network_events=network_events)
    return {"status":"passed", "rollback_state":state}


def _seed_lifecycle_sessions(core_dir: Path, state_root: Path, bundle_root: Path, manifest: str) -> None:
    # Use Core's serializer only in the harness-owned state directories. No chat
    # request/provider is needed to exercise saved-session navigation.
    env = _sanitized_environment(state_root=state_root, agent_stub=state_root / "agent-stub",
        extension_root=bundle_root, manifest_relative=manifest, port=0)
    script = """import os
from api.models import Session
for suffix in ('A','B','C'):
    Session(session_id='tiling-compat-'+suffix, title='Synthetic tile '+suffix,
        workspace=os.environ['HERMES_WEBUI_DEFAULT_WORKSPACE'],
        messages=[{'role':'user','content':'Synthetic request '+suffix},
                  {'role':'assistant','content':'Synthetic answer '+suffix}]).save()
"""
    subprocess.run([sys.executable, "-c", script], cwd=core_dir, env=env, check=True,
                   capture_output=True, text=True)


def _test_real_core_lifecycle(*, page: Any, evidence_dir: Path) -> dict[str, Any]:
    # Runs production loadSession and real registered Core hooks, not a setter
    # mock. Only the explicitly synthetic stream boundary/cancel disposition
    # below is injected; no provider or backend stream is started.
    checks = page.evaluate("""async () => {
      const T=chatTilingState, rows=[];
      const check=(name,pass,details)=>rows.push({name,pass:!!pass,details});
      const owner=()=>T.tiles.find(t=>t.id===T.activeId)?.sid;
      const reset=async()=>{
        S.busy=false;S.activeStreamId=null;
        for(const t of T.tiles){t.busy=false;t.activeStreamId=null;}
        if(T.visible)await hideGridExt();
        await loadSession('tiling-compat-A',{skipExtHooks:true,force:true});
        await showGridExt(2,1);
      };
      await reset();
      document.getElementById('msg').value='Synthetic live no-op draft';
      await loadSession('tiling-compat-A');
      check('same-SID no-op preserves live draft',document.getElementById('msg').value==='Synthetic live no-op draft');
      check('same-SID preload-only has no reservation',T.tiles.every(t=>!t._pending));
      await reset();
      S.messages=[...S.messages,{role:'assistant',content:'Synthetic late A snapshot'}];
      await loadSession('tiling-compat-B');
      const a=T.tiles.find(t=>t.sid==='tiling-compat-A'), b=T.tiles.find(t=>t.sid==='tiling-compat-B');
      check('preload snapshots outgoing hydrated content',a.messages.some(m=>m.content==='Synthetic late A snapshot'));
      check('loaded hydrates messages immediately',b.messages.length===S.messages.length&&b.messages.length===2,{tile:b.messages.length,core:S.messages.length});
      await focusTileExt(a.id);
      check('internal focus preserves distinct sessions',new Set(T.tiles.map(t=>t.sid)).size===2&&owner()===S.session.session_id);
      await loadSession('tiling-compat-B');
      check('existing SID reuses its own tile',owner()==='tiling-compat-B'&&T.activeId===b.id&&T.tiles.filter(t=>t.sid==='tiling-compat-B').length===1);
      await loadSession('tiling-compat-C');
      check('full grid veto preserves Core and tile ownership',S.session.session_id==='tiling-compat-B'&&owner()==='tiling-compat-B'&&T.tiles.map(t=>t.sid).sort().join(',')==='tiling-compat-A,tiling-compat-B');
      await closeTileExt(b.id);
      check('active close settles surviving Core owner',T.tiles.length===1&&owner()==='tiling-compat-A'&&S.session.session_id==='tiling-compat-A');

      await reset();
      const realNotify=window._hermesNotifySessionOpen, realCancel=window.cancelSessionStream;
      let cancels=0, allow=false;
      window._hermesNotifySessionOpen=function(sid,data,opts){
        if(opts?.loaded&&sid==='tiling-compat-B'){S.busy=true;S.activeStreamId='synthetic-stream-B';}
        return realNotify(sid,data,opts);
      };
      window.cancelSessionStream=async session=>{
        cancels++;
        check('cancel uses matching snake-case owner',session.session_id==='tiling-compat-B'&&session.active_stream_id==='synthetic-stream-B');
        if(allow){S.busy=false;S.activeStreamId=null;}
        return allow;
      };
      try {
        await loadSession('tiling-compat-B');
        const busy=T.tiles.find(t=>t.sid==='tiling-compat-B');
        check('loaded busy stream is immediate',busy.busy&&busy.activeStreamId===S.activeStreamId);
        await closeAllExt();
        check('close-all refuses immediate busy stream',T.visible&&T.tiles.includes(busy));
        await closeTileExt(busy.id);
        check('refused cancel preserves busy tile',cancels===1&&T.tiles.includes(busy));
        allow=true;
        await Promise.all([closeTileExt(busy.id),closeTileExt(busy.id)]);
        check('repeated close is single-flight',cancels===2&&T.tiles.length===1&&owner()===S.session.session_id);
      } finally {window._hermesNotifySessionOpen=realNotify;window.cancelSessionStream=realCancel;S.busy=false;S.activeStreamId=null;}

      // A cancellation response cannot authorize removal of later ownership.
      for(const disposition of ['rebound-session','replacement-stream','cleared-old-stream']){
        await reset();await loadSession('tiling-compat-B');
        S.busy=true;S.activeStreamId='synthetic-old-stream-B';
        const tile=T.tiles.find(t=>t.sid==='tiling-compat-B');
        const cancel=window.cancelSessionStream;
        const settings=HermesExtensionSettings.settingsForExtension('chat-tiling');
        const auto=settings.get('auto_tile');let release;
        window.cancelSessionStream=()=>new Promise(resolve=>{release=resolve});
        try{
          const closing=closeTileExt(tile.id);
          await new Promise(resolve=>setTimeout(resolve,10));
          if(disposition==='rebound-session'){
            settings.set('auto_tile',false);
            await loadSession('tiling-compat-C');
          }else if(disposition==='replacement-stream'){
            S.activeStreamId='synthetic-new-stream-B';
          }else{
            S.busy=false;S.activeStreamId=null;
          }
          release(true);await closing;
          if(disposition==='cleared-old-stream'){
            check('successful cleared old stream closes',!T.tiles.includes(tile)&&owner()==='tiling-compat-A'&&S.session.session_id===owner());
          }else{
            const sid=disposition==='rebound-session'?'tiling-compat-C':'tiling-compat-B';
            check('pending cancellation preserves '+disposition,T.tiles.includes(tile)&&tile.sid===sid&&owner()===sid&&S.session.session_id===sid&&
              (disposition!=='replacement-stream'||tile.activeStreamId==='synthetic-new-stream-B'));
          }
        }finally{window.cancelSessionStream=cancel;settings.set('auto_tile',auto??true);S.busy=false;S.activeStreamId=null;}
      }
      await reset();await loadSession('tiling-compat-B');
      const closingTarget=T.tiles.find(t=>t.sid==='tiling-compat-B');
      await Promise.all([closeTileExt(closingTarget.id),focusTileExt(closingTarget.id)]);
      check('queued removed-target focus settles surviving actual owner',T.tiles.length===1&&owner()==='tiling-compat-A'&&S.session.session_id===owner());

      await reset();await loadSession('tiling-compat-B');
      const target=T.tiles.find(t=>t.sid==='tiling-compat-A');
      const realLoad=window.loadSession;let release;
      window.loadSession=()=>new Promise(resolve=>{release=resolve});
      try{
        const pending=focusTileExt(target.id);
        await new Promise(resolve=>setTimeout(resolve,10));
        await realLoad('tiling-compat-B',{force:true});
        release();await pending;
        check('interrupted focus respects newer actual loaded owner',owner()==='tiling-compat-B'&&S.session.session_id===owner());
      }finally{window.loadSession=realLoad;}
      check('toolbar is outside desktop drag region',getComputedStyle(document.getElementById('ext-tiling-toolbar')).webkitAppRegion==='no-drag'&&[...document.querySelectorAll('#ext-tiling-toolbar button')].every(el=>getComputedStyle(el).webkitAppRegion==='no-drag'));
      return rows;
    }""")
    _write_json(evidence_dir / "real-core-lifecycle.json", checks)
    failures = [c["name"] for c in checks if not c["pass"]]
    if failures:
        raise CompatibilityFailure(f"real-core-lifecycle: {failures!r}")
    viewports = []
    await_js = """async () => {await showGridExt(2,2);return true;}"""
    page.evaluate(await_js)
    for name, width, height in (("desktop",1440,900),("narrow",768,1024),("mobile-width",390,844)):
        page.set_viewport_size({"width":width,"height":height})
        geometry = page.evaluate("""() => {
          const tb=document.getElementById('ext-tiling-toolbar').getBoundingClientRect();
          const cells=[...document.querySelectorAll('.ext-tile')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}});
          return {toolbar:{x:tb.x,right:tb.right,width:tb.width},cells};
        }""")
        if (geometry["toolbar"]["x"] < 0 or geometry["toolbar"]["right"] > width
                or len(geometry["cells"]) != 4
                or len({(c["x"],c["y"]) for c in geometry["cells"]}) != 4
                or any(c["width"] <= 0 or c["height"] <= 0 or c["right"] > width for c in geometry["cells"])):
            raise CompatibilityFailure(f"real-core-lifecycle {name}: {geometry!r}")
        _record_screenshot(page,evidence_dir / f"lifecycle-{name}.png")
        viewports.append({"name":name,"width":width,"height":height,**geometry})
    page.set_viewport_size({"width":1440,"height":1000})
    return {"status":"passed","checks":checks,"viewports":viewports,"stream":"synthetic boundary; no provider"}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = _parse_args()
    evidence_dir = Path(args.evidence_dir).expanduser().resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {
        "extension_id": EXTENSION_ID,
        "cases": {},
    }
    results_path = evidence_dir / "chat-tiling-geometry-results.json"

    try:
        core_dir = Path(args.core_dir).expanduser().resolve()
        extension_root = Path(args.extension_root).expanduser().resolve()
        if not core_dir.is_dir():
            raise SetupFailure(
                "HERMES_CORE_DIR/--core-dir must point to an independent Hermes WebUI checkout"
            )
        if not extension_root.is_dir():
            raise SetupFailure(f"extension root not found: {extension_root}")

        with tempfile.TemporaryDirectory(prefix="hermes-chat-tiling-") as temp:
            temp_root = Path(temp)
            bundle_root = temp_root / "bundle"
            bundle_root.mkdir()
            manifest_relative = _prepare_extension_bundle(extension_root, bundle_root)

            state_root = temp_root / "state"
            log_path = evidence_dir / "chat-tiling-server.log"
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
                results["port"] = port
                _seed_lifecycle_sessions(core_dir, state_root, bundle_root, manifest_relative)

                from playwright.sync_api import sync_playwright

                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(
                        headless=True,
                        executable_path=os.environ.get("CHAT_TILING_CHROMIUM") or None,
                        args=["--no-sandbox", "--disable-dev-shm-usage"],
                    )
                    context = browser.new_context(
                        viewport={"width": 1440, "height": 1000},
                        service_workers="block",
                    )
                    network_events = _install_network_guards(context)
                    page = context.new_page()

                    console_errors: list[dict[str, str]] = []
                    page_errors: list[str] = []

                    def on_console(message: Any) -> None:
                        if message.type != "error":
                            return
                        location = getattr(message, "location", {}) or {}
                        location_url = (
                            location.get("url", "")
                            if isinstance(location, dict)
                            else getattr(location, "url", "")
                        )
                        console_errors.append(
                            {"text": str(message.text), "url": str(location_url)}
                        )

                    page.on("console", on_console)
                    page.on("pageerror", lambda error: page_errors.append(str(error)))

                    try:
                        _boot_page(page, base_url)
                        _wait_for_extension_resource(page, base_url)

                        lifecycle = _test_real_core_lifecycle(page=page, evidence_dir=evidence_dir)
                        results["cases"]["real-core-lifecycle"] = lifecycle
                        _write_json(results_path, results)
                        await_grid = "async () => {await hideGridExt();await showGridExt(2,1);}"
                        page.evaluate(await_grid)

                        # Activate the 2-tile grid via the toolbar.
                        _activate_grid(page, cols=2, rows=1)

                        # Case 1: focused tile click pass-through.
                        case1 = _test_focused_tile_click_pass_through(
                            page=page,
                            console_errors=console_errors,
                            page_errors=page_errors,
                            network_events=network_events,
                            evidence_dir=evidence_dir,
                        )
                        results["cases"]["focused-tile-click-pass-through"] = case1
                        _write_json(results_path, results)

                        # Case 2: #messages scrolls with overlay active.
                        case2 = _test_messages_scrolls_with_overlay(
                            page=page,
                            console_errors=console_errors,
                            page_errors=page_errors,
                            network_events=network_events,
                            evidence_dir=evidence_dir,
                        )
                        results["cases"]["messages-scrolls-with-overlay"] = case2
                        _write_json(results_path, results)

                        # Case 3: failed-focus rollback.
                        case3 = _test_failed_focus_rollback(
                            page=page,
                            console_errors=console_errors,
                            page_errors=page_errors,
                            network_events=network_events,
                            evidence_dir=evidence_dir,
                        )
                        results["cases"]["failed-focus-rollback"] = case3
                        _write_json(results_path, results)

                    except Exception:
                        _record_screenshot(page, evidence_dir / "exception.png")
                        raise
                    finally:
                        _write_json(
                            evidence_dir / "chat-tiling-network.json", network_events
                        )
                        context.close()
                        browser.close()
            finally:
                _terminate(proc, log_file)

        # Final verdict.
        for case_name, case_result in results["cases"].items():
            if case_result.get("status") != "passed":
                raise CompatibilityFailure(f"{case_name} did not pass")

        results["status"] = "passed"
        _write_json(results_path, results)
        print("CHAT TILING GEOMETRY PASSED")
        print(f"cases={list(results['cases'].keys())}")
        print(f"evidence={evidence_dir}")
        return 0

    except SetupFailure as exc:
        results["status"] = "setup_failure"
        results["error"] = str(exc)
        _write_json(results_path, results)
        print(f"SETUP FAILURE: {exc}", file=sys.stderr)
        print(f"evidence={evidence_dir}", file=sys.stderr)
        return 2
    except CompatibilityFailure as exc:
        results["status"] = "failed"
        results["error"] = str(exc)
        _write_json(results_path, results)
        print(f"CHAT TILING GEOMETRY FAILED: {exc}", file=sys.stderr)
        print(f"evidence={evidence_dir}", file=sys.stderr)
        return 1
    except Exception as exc:
        results["status"] = "harness_error"
        results["error"] = f"{type(exc).__name__}: {exc}"
        results["traceback"] = traceback.format_exc()
        _write_json(results_path, results)
        print(f"HARNESS ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        print(f"evidence={evidence_dir}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())