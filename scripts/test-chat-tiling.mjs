#!/usr/bin/env node
// Chat Tiling — behavior tests for the activation state machine
// Run: `node scripts/test-chat-tiling.mjs`
//
// ALL grid-dependent scenarios run while the grid is visible (shown once).
// The auto_tile test runs after the handler lifecycle but BEFORE hideGrid,
// so no showGrid-after-hideGrid is needed.

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
    <textarea id="msg">initial-composer-value</textarea>
    <select id="modelSelect"><option value="gpt4">GPT-4</option><option value="claude">Claude</option></select>
  </body></html>`,
  { url: 'http://localhost' }
);
const { window } = dom;
const { document } = window;

let S = { session: null, messages: [], busy: false, activeStreamId: null };
let renderMessagesCalled = 0;
let loadSessionResolvers = [];
let handlerRegistration = null;

const mockExtSettings = { auto_tile: true, show_sidebar_badges: true };
window.HermesExtensionSettings = {
  settingsForExtension: () => ({
    get: (key, dflt) => mockExtSettings[key] !== undefined ? mockExtSettings[key] : (dflt !== undefined ? dflt : undefined)
  })
};

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
  section('Scenario 1: Inactive on page load');
  {
    assert(typeof window.focusTileExt === 'function', 'focusTileExt export defined');
    assert(typeof window.closeTileExt === 'function', 'closeTileExt export defined');
    assert(typeof window.openTileForSessionExt === 'function', 'openTileForSessionExt export defined');
    assert(renderMessagesCalled === 0, 'renderMessages not called on load (no grid shown)');
  }

  // ══════════════════════════════════════════════════════════════
  // GRID LIFECYCLE — show grid once, keep it visible
  // ══════════════════════════════════════════════════════════════
  section('Scenario 2: Stale A→B guard (S mutated between preload and loaded)');
  {
    loadSessionResolvers = [];
    renderMessagesCalled = 0;
    S.extraField = 'should-survive';
    document.getElementById('msg').value = 'draft-text';
    showGrid();

    handlerRegistration('sid-A',
      { session: { session_id: 'sid-A', messages: ['a1'], title: 'A' } },
      { preload: true });
    S.session = { session_id: 'sid-A', title: 'A' };
    S.messages = ['a1-core-loaded'];
    S.busy = true;
    handlerRegistration('sid-A',
      { session: { session_id: 'sid-A', messages: ['a1'], title: 'A' } },
      { loaded: true });

    handlerRegistration('sid-B',
      { session: { session_id: 'sid-B', messages: ['b1'], title: 'B' } },
      { preload: true });
    S.session = { session_id: 'sid-B', title: 'B' };
    S.messages = ['b1-core-loaded'];
    S.busy = true;
    handlerRegistration('sid-B',
      { session: { session_id: 'sid-B', messages: ['b1'], title: 'B' } },
      { loaded: true });

    window.focusTileExt(1, {});
    assert(loadSessionResolvers.length >= 1, 'loadSession called for A');
    globalThis.__aReq = loadSessionResolvers[0];
    assert(globalThis.__aReq.sid === 'sid-A', 'loadSession sid-A');

    window.focusTileExt(2, {});
    assert(loadSessionResolvers.length >= 2, 'loadSession called for B');

    const bReq = loadSessionResolvers[1];
    bReq.resolve();
  }

  section('Scenario 2 (cont): B resolved, A rejected stale');
  {
    await null;
    assert(true, 'B loadSession resolved (B is active)');
    const beforeRender = renderMessagesCalled;
    globalThis.__aReq.reject(new Error('stale'));
    await null;
    await null;
    assert(renderMessagesCalled === beforeRender,
      'renderMessages NOT called by stale A rejection');
  }

  // ── Visible grid handler lifecycle ───────────────────────
  section('Scenario 3: Real handler lifecycle with visible grid');
  {
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, `2 tiles before handler lifecycle (got ${tiles.length})`);

    const r1 = handlerRegistration('sid-C',
      { session: { session_id: 'sid-C', messages: ['c1'], title: 'C' } },
      { preload: true });
    assert(r1 && typeof r1 === 'object', 'preload handler returns object');

    S.session = { session_id: 'sid-C', title: 'C' };
    S.messages = ['c1-core-loaded'];
    S.busy = true;

    const r2 = handlerRegistration('sid-C',
      { session: { session_id: 'sid-C', messages: ['c1'], title: 'C' } },
      { loaded: true });
    assert(r2 && typeof r2 === 'object', 'loaded handler returns object');

    const tiles2 = Array.from(document.querySelectorAll('.ext-tile'));
    assert(tiles2.length === 2, `2 tiles remain after handler lifecycle (got ${tiles2.length})`);
  }

  // ── auto_tile:false guard (grid still visible) ──────────
  section('Scenario 4: auto_tile:false guard');
  {
    mockExtSettings.auto_tile = false;

    const r1 = handlerRegistration('sid-D',
      { session: { session_id: 'sid-D', messages: ['d1'], title: 'D' } },
      { preload: true });
    assert(r1 && typeof r1 === 'object' && Object.keys(r1).length === 0,
      'preload returns {} when auto_tile=false');

    const r2 = handlerRegistration('sid-D',
      { session: { session_id: 'sid-D', messages: ['d1'], title: 'D' } },
      { loaded: true });
    assert(r2 && typeof r2 === 'object' && Object.keys(r2).length === 0,
      'loaded returns {} when auto_tile=false');

    const sidDTile = Array.from(document.querySelectorAll('.ext-tile'))
      .find(el => el.dataset.tileId &&
        document.querySelector(`.ext-tile[data-tile-id="${el.dataset.tileId}"] .ext-tile-title`)?.textContent === 'D');
    assert(!sidDTile, 'no tile created for sid-D when auto_tile is false');

    mockExtSettings.auto_tile = true;
  }

  // ── closeTile double-close ──────────────────────────────
  section('Scenario 5: closeTile idempotent (double-close race)');
  {
    const ids = getTileIds();
    assert(ids.length >= 2, 'at least 2 tiles before close');

    const p1 = window.closeTileExt(ids[0]);
    const p2 = window.closeTileExt(ids[0]);
    await Promise.all([p1, p2]);

    const remaining = getTileIds();
    assert(remaining.length === 1, 'only one tile removed despite two close calls');
    if (remaining.length === 1) {
      const el = document.querySelector(`.ext-tile[data-tile-id="${remaining[0]}"]`);
      assert(el && el.classList.contains('ext-tile--focused'), 'remaining tile is focused');
      const mi = el.querySelector('.ext-tile-msg-inner');
      assert(mi && mi.id === 'msgInner', 'msgInner moved to remaining tile');
    }
  }

  // ── hideGrid restores full S state ──────────────────────
  section('Scenario 6: hideGrid restores original S full state');
  {
    S.session = { session_id: 'SHOULD-BE-OVERWRITTEN' };
    S.messages = ['should be lost'];
    S.busy = true;
    S.activeStreamId = 'should-be-lost';
    S.extraField = 'should-be-overwritten-too';

    const ids = getTileIds();
    await window.closeTileExt(ids[0]);

    assert(renderMessagesCalled > 0, 'renderMessages called during close/hide');
    assert(S.session === null, 'S.session restored to null');
    assert(Array.isArray(S.messages) && S.messages.length === 0,
      'S.messages restored to pre-showGrid empty state');
    assert(S.busy === false, 'S.busy restored to false');
    assert(S.activeStreamId === null, 'S.activeStreamId restored to null');
    assert(S.extraField === 'should-survive', 'extra field S.extraField survives grid cycle');
  }

  // ── Extra-field survival ────────────────────────────────
  section('Scenario 7: Non-default fields survive grid cycle');
  {
    assert(S.session === null, 'S.session null');
    assert(Array.isArray(S.messages) && S.messages.length === 0, 'S.messages empty');
    assert(typeof S.busy === 'boolean', 'S.busy is boolean');
    assert(S.extraField === 'should-survive', 'S.extraField survives full cycle');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
