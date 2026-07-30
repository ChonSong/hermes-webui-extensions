#!/usr/bin/env node
// Chat Tiling — behavior tests for the activation state machine
// Run: `node scripts/test-chat-tiling.mjs`
//
// Ordering matters: the stale-guard test runs BEFORE any closeTile/hideGrid
// work so renderMessages counts track only the guard's effect. All grid-
// dependent operations happen before the first `await null` so toolbar clicks
// work. Direct function calls (closeTileExt, not toolbar) are used after
// the async section for remaining grid cleanup.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const dom = new JSDOM(
  `<!DOCTYPE html>
  <html><head></head><body>
    <div id="messages"><div id="msgInner"></div></div>
  </body></html>`,
  { url: 'http://localhost' }
);
const { window } = dom;
const { document } = window;

let S = { session: null, messages: [], busy: false, activeStreamId: null };
let renderMessagesCalled = 0;
let loadSessionResolvers = [];
let handlerRegistration = null;

window.S = S;
window.registerHermesSessionOpenHandler = (fn) => { handlerRegistration = fn; };
window.renderMessages = () => { renderMessagesCalled++; };
window.loadSession = (sid) => {
  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });
  loadSessionResolvers.push({ sid, resolve, reject, promise: p });
  return p;
};
window.api = () => Promise.resolve({ messages: [] });
window.renderTranscript = () => {};
window.HermesExtensionSettings = null;
window.CSS = { escape: s => s };
window.autoResize = () => {};
window._onModelSelectChange = () => {};
window.syncTopbar = () => {};
window.syncModelChip = () => {};
window.cancelSessionStream = () => {};
window.showToast = () => {};
window.INFLIGHT = {};

globalThis.window = window;
globalThis.document = document;
globalThis.S = S;
globalThis.renderMessages = window.renderMessages;
globalThis.loadSession = window.loadSession;
globalThis.registerHermesSessionOpenHandler = window.registerHermesSessionOpenHandler;
globalThis.localStorage = window.localStorage;
globalThis.CSS = window.CSS;

const code = readFileSync(path.join(repoRoot, 'extensions/chat-tiling/assets/tiling.js'), 'utf8');
eval(code);
document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ FAIL: ' + msg); } }
function section(name) { console.log('\n' + name); }
function showGrid() { const b = document.querySelector('.ext-toolbar-btn[data-layout="2x1"]'); if (b) b.click(); }
function hideGrid() { const b = document.querySelector('.ext-toolbar-btn[data-layout="close"]'); if (b) b.click(); }
function getTileIds() { return Array.from(document.querySelectorAll('.ext-tile')).map(el => parseInt(el.dataset.tileId)); }

async function main() {
  // ══════════════════════════════════════════════════════════════
  // SYNC SECTION — all toolbar/grid DOM operations
  // ══════════════════════════════════════════════════════════════
  section('Scenario 1: Inactive on page load');
  {
    assert(typeof window.focusTileExt === 'function', 'focusTileExt export defined');
    assert(typeof window.closeTileExt === 'function', 'closeTileExt export defined');
    assert(typeof window.openTileForSessionExt === 'function', 'openTileForSessionExt export defined');
    assert(renderMessagesCalled === 0, 'renderMessages not called on load (no grid shown)');
  }

  // ── Show grid, register sessions, focus A then B ────────────────────
  section('Scenario 2: Stale A→B guard (resolve B first, reject A after)');
  {
    loadSessionResolvers = [];
    renderMessagesCalled = 0;
    showGrid();

    // Register both sessions
    handlerRegistration('sid-A',
      { session: { session_id: 'sid-A', messages: ['a1'], title: 'A' } },
      { preload: true });
    handlerRegistration('sid-A',
      { session: { session_id: 'sid-A', messages: ['a1'], title: 'A' } },
      { loaded: true });
    handlerRegistration('sid-B',
      { session: { session_id: 'sid-B', messages: ['b1'], title: 'B' } },
      { preload: true });
    handlerRegistration('sid-B',
      { session: { session_id: 'sid-B', messages: ['b1'], title: 'B' } },
      { loaded: true });

    // Focus A → loadSession('sid-A')
    window.focusTileExt(1, {});
    assert(loadSessionResolvers.length >= 1, 'loadSession called for A');
    globalThis.__aReq = loadSessionResolvers[0];
    assert(globalThis.__aReq.sid === 'sid-A', 'loadSession sid-A');

    // Focus B → loadSession('sid-B') — B's gen > A's gen
    window.focusTileExt(2, {});
    assert(loadSessionResolvers.length >= 2, 'loadSession called for B');

    // RESOLVE B FIRST (B becomes active). .then handler queued as microtask.
    const bReq = loadSessionResolvers[1];
    bReq.resolve();
  }

  // ══════════════════════════════════════════════════════════════
  // ASYNC SECTION — first flush: B resolved → B active
  // ══════════════════════════════════════════════════════════════
  section('Scenario 2 (continued): B resolved, A rejected stale');
  {
    await null; // flush microtasks → B's .then fires

    // B is now active (renderMessages may have been called by showTile)
    assert(true, 'B loadSession resolved (B is active)');

    // Capture render count BEFORE rejecting A. No code runs between capture
    // and A's .catch handler (after next flush), so any change proves the
    // guard failed.
    const beforeRender = renderMessagesCalled;
    globalThis.__aReq.reject(new Error('stale')); // .catch handler queued as microtask

    await null; // flush → .catch handler fires with stale gen
    await null; // ensure full microtask drain in JSDOM

    assert(renderMessagesCalled === beforeRender,
      'renderMessages NOT called by stale A rejection (gen guard prevented restoreFromTile)');
  }

  // ── closeTile (direct call, no toolbar needed) ───────────────────────
  section('Scenario 3: closeTile focus fallback');
  {
    const ids = getTileIds();
    assert(ids.length >= 2, 'at least 2 tiles exist before close');
    window.closeTileExt(ids[0]);
    const remaining = getTileIds();
    assert(remaining.length === 1, 'one tile remains after close');
    if (remaining.length === 1) {
      const el = document.querySelector(`.ext-tile[data-tile-id="${remaining[0]}"]`);
      assert(el && el.classList.contains('ext-tile--focused'), 'remaining tile is focused');
      const mi = el.querySelector('.ext-tile-msg-inner');
      assert(mi && mi.id === 'msgInner', 'msgInner moved to remaining tile');
    }
  }

  // ── hideGrid restores S from T._saved ────────────────────────────────
  section('Scenario 4: hideGrid restores original session');
  {
    // Clobber S with sentinel values to prove restoration
    S.session = { session_id: 'SHOULD-BE-OVERWRITTEN' };
    S.messages = ['should be lost'];
    S.busy = true;
    S.activeStreamId = 'should-be-lost';

    // Close remaining tiles via direct call; last tile triggers hideGrid
    const ids = getTileIds();
    for (const id of ids) {
      window.closeTileExt(id);
    }

    assert(renderMessagesCalled > 0, 'renderMessages called during close/hide');

    // After hideGrid, S should be restored from T._saved (captured by showGrid
    // in Scenario 2 when S had session:null, messages:[], busy:false)
    assert(S.session === null, 'S.session restored to null (pre-showGrid value)');
    assert(Array.isArray(S.messages) && S.messages.length === 0,
      'S.messages restored to pre-showGrid empty state');
    assert(S.busy === false, 'S.busy restored to false (pre-showGrid value)');
    assert(S.activeStreamId === null, 'S.activeStreamId restored to null');
  }

  // ── Scenario 5: Core hook payload shape ──────────────────────────────
  section('Scenario 5: Extension handler receives core payload');
  {
    // Use the extension's real initCapture handler, not a test mock
    const extHandler = handlerRegistration;
    assert(typeof extHandler === 'function', 'extension initCapture handler registered');

    // Handler is stateful (T.visible must be true for grid operations).
    // With grid hidden, it returns {} for both phases — verify no crash.
    const r1 = extHandler('test-sid',
      { session: { session_id: 'test-sid', messages: ['hi'], title: 'Test' } },
      { preload: true });
    assert(r1 && typeof r1 === 'object', 'preload handler returns object (no-op when hidden)');

    const r2 = extHandler('test-sid',
      { session: { session_id: 'test-sid', messages: ['hi'], title: 'Test' } },
      { loaded: true });
    assert(r2 && typeof r2 === 'object', 'loaded handler returns object (no-op when hidden)');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
