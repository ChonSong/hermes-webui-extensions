#!/usr/bin/env node
// Chat Tiling — behavior tests
// Run: `node scripts/test-chat-tiling.mjs`
//
// Grid shown ONCE at the start. All grid tests reuse same 2-tile grid.
// State restoration test runs last (single hide, single verify).

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
let transcriptRenders = [];
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
window.loadSession = (sid, opts) => {
  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });
  loadSessionResolvers.push({ sid, opts, resolve, reject, promise: p });
  return p;
};
window.api = () => Promise.resolve({});
window.renderTranscript = (target, msgs, opts) => {
  transcriptRenders.push({ target, messages: msgs ? [...msgs] : msgs });
  if (target && msgs) {
    target.innerHTML = msgs.map(m => `<div class="msg">${typeof m === 'string' ? m : (m.content || '')}</div>`).join('');
  }
};
window.CSS = { escape: s => s };
window.autoResize = () => {};
window.syncTopbar = () => {};
window.syncModelChip = () => {};
window.cancelSessionStream = () => Promise.resolve(true);
window.showToast = () => {};
window.clearInflightState = () => {};
window.INFLIGHT = {};

globalThis.window = window;
globalThis.document = document;
globalThis.S = S;
globalThis.renderMessages = window.renderMessages;
globalThis.loadSession = window.loadSession;
globalThis.registerHermesSessionOpenHandler = window.registerHermesSessionOpenHandler;
globalThis.localStorage = window.localStorage;
globalThis.CSS = window.CSS;
globalThis.cancelSessionStream = window.cancelSessionStream;
globalThis.INFLIGHT = window.INFLIGHT;
globalThis.clearInflightState = window.clearInflightState;

const code = readFileSync(path.join(repoRoot, 'extensions/chat-tiling/assets/tiling.js'), 'utf8');
eval(code);
document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ FAIL: ' + msg); } }
function section(name) { console.log('\n' + name); }

async function clickLayout(layout) {
  const b = document.querySelector(`.ext-toolbar-btn[data-layout="${layout}"]`);
  if (!b) console.log('[helper] btn ' + layout + ' NOT FOUND');
  else b.click();
  await null; await null; // let async handlers settle
}

async function main() {
  // ═══════ SHOW GRID ONCE (2-tile) ═══════
  S.extraField = 'should-survive';
  S.session = { session_id: 'sid-init', title: 'Init', messages: ['hello'] };
  S.messages = ['hello'];
  document.getElementById('msg').value = 'draft-save';
  await clickLayout('2x1');

  // ═══════ Scenario 1: Page load ═══════
  section('S1: Exports and initial state');
  {
    assert(typeof window.focusTileExt === 'function', 'focusTileExt export');
    assert(typeof window.closeTileExt === 'function', 'closeTileExt export');
    assert(typeof window.openTileForSessionExt === 'function', 'openTileForSessionExt export');
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, '2 tiles after show grid');
    assert(tiles.some(t => t.querySelector('.ext-tile-title')?.textContent === 'Init'),
      'first tile seeded from current session');
  }

  // ═══════ Scenario 2: Stale guard ═══════
  section('S2: Stale focus guard');
  {
    loadSessionResolvers = [];
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    // Find the seeded tile (has a sid) to trigger loadSession on focus
    const seeded = tiles.find(t => t.querySelector('.ext-tile-title')?.textContent === 'Init');
    const sId = parseInt(seeded.dataset.tileId);

    // Focus to trigger loadSession
    window.focusTileExt(sId, {});
    await null;
    const req = loadSessionResolvers[0];
    assert(!!req, 'loadSession triggered by focus');

    // Focus same tile again (new gen) before first resolves
    loadSessionResolvers = [];
    window.focusTileExt(sId, {});
    await null;
    const req2 = loadSessionResolvers[0];
    assert(!!req2, 'second focus triggers new loadSession');

    const before = renderMessagesCalled;
    req2.resolve(); await null; await null; // fresh resolves
    req.reject(new Error('stale')); await null; await null; // stale = suppressed
    assert(renderMessagesCalled === before,
      'stale rejection suppressed (no renderMessages)');
  }

  // ═══════ Scenario 3: Handler lifecycle with real payload ═══════
  section('S3: Handler lifecycle — real payload');
  {
    transcriptRenders = [];
    const emptyTile = Array.from(document.querySelectorAll('.ext-tile'))
      .find(t => t.querySelector('.ext-tile-title')?.textContent !== 'Init');
    assert(!!emptyTile, 'empty tile available');

    S.busy = false;
    handlerRegistration('sid-A', { session_id: 'sid-A', title: 'A' }, { preload: true });
    S.session = { session_id: 'sid-A', title: 'A', messages: ['a-loaded'] };
    S.messages = ['a-loaded'];
    S.busy = true;
    handlerRegistration('sid-A', { session_id: 'sid-A', title: 'A' }, { loaded: true });
    await null;

    const tileA = Array.from(document.querySelectorAll('.ext-tile'))
      .find(t => t.querySelector('.ext-tile-title')?.textContent === 'A');
    assert(!!tileA, 'tile A exists');
    const miA = tileA.querySelector('.ext-tile-msg-inner');
    const rA = transcriptRenders.find(r => r.target === miA);
    assert(!!rA, 'renderTranscript for tile A');
    assert(rA.messages?.[0] === 'a-loaded', 'messages from S.messages not data wrapper');
    assert(miA.querySelectorAll('.msg').length > 0, 'tile A has visible transcript');
  }

  // ═══════ Scenario 4: Duplicate session ═══════
  section('S4: Duplicate session focus');
  {
    transcriptRenders = [];
    handlerRegistration('sid-A', { session_id: 'sid-A' }, { preload: true });
    await null;

    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, 'no new tile created for dup session');
    const msgInner = document.getElementById('msgInner');
    assert(!!msgInner, 'msgInner exists');
    const focused = tiles.find(t => t.classList.contains('ext-tile--focused'));
    assert(!!focused, 'a tile is focused');
    assert(focused.querySelector('.ext-tile-msg-inner') === msgInner,
      'msgInner in focused tile');
  }

  // ═══════ Scenario 5: auto_tile:false ═══════
  section('S5: auto_tile=false guard');
  {
    mockExtSettings.auto_tile = false;
    const r1 = handlerRegistration('sid-D', { session_id: 'sid-D', title: 'D' }, { preload: true });
    assert(r1 && Object.keys(r1).length === 0, 'preload returns {}');

    const r2 = handlerRegistration('sid-D', { session_id: 'sid-D', title: 'D' }, { loaded: true });
    assert(r2 && Object.keys(r2).length === 0, 'loaded returns {}');

    const tileD = Array.from(document.querySelectorAll('.ext-tile'))
      .find(t => t.querySelector('.ext-tile-title')?.textContent === 'D');
    assert(!tileD, 'no tile for sid-D');
    mockExtSettings.auto_tile = true;
  }

  // ═══════ Scenario 6: Double-close ═══════
  section('S6: Double-close idempotent');
  {
    const ids = Array.from(document.querySelectorAll('.ext-tile')).map(t => parseInt(t.dataset.tileId));
    assert(ids.length === 2, '2 tiles before close');

    const p1 = window.closeTileExt(ids[0]);
    const p2 = window.closeTileExt(ids[0]);
    await Promise.all([p1, p2]);

    const remaining = Array.from(document.querySelectorAll('.ext-tile')).map(t => parseInt(t.dataset.tileId));
    assert(remaining.length === 1, 'only 1 tile removed');
    const el = document.querySelector(`.ext-tile[data-tile-id="${remaining[0]}"]`);
    assert(el?.classList.contains('ext-tile--focused'), 'remaining tile focused');
    assert(el?.querySelector('.ext-tile-msg-inner')?.id === 'msgInner', 'msgInner on remaining tile');
  }

  // ═══════ Scenario 7: hideGrid restores S ═══════
  section('S7: hideGrid full S restoration');
  {
    S.session = { session_id: 'WILL-LOSE' };
    S.messages = ['replace'];
    S.busy = true;
    S.activeStreamId = 'will-lose';
    S.extraField = 'should-be-overwritten';
    document.getElementById('msg').value = 'draft-final';

    const ids = Array.from(document.querySelectorAll('.ext-tile')).map(t => parseInt(t.dataset.tileId));
    assert(ids.length === 1, '1 tile before hide');
    await window.closeTileExt(ids[0]);

    assert(renderMessagesCalled > 0, 'renderMessages called');
    // Pre-grid state had S.session='sid-init' and S.messages=['hello']
    assert(S.session && S.session.session_id === 'sid-init',
      `S.session restored to pre-grid state (got ${S.session?.session_id})`);
    assert(Array.isArray(S.messages) && S.messages[0] === 'hello',
      `S.messages restored to pre-grid messages (got ${S.messages?.[0]})`);
    assert(S.busy === false, 'S.busy false');
    assert(S.activeStreamId === null, 'S.activeStreamId null');
    assert(S.extraField === 'should-survive', 'S.extraField survives');
    assert(document.getElementById('msg').value === 'draft-save',
      'composer restored to pre-grid value');
  }

  // ═══════ Scenario 8: Mutation guard check ═══════
  section('S8: Double-close guard exists');
  {
    const hasGuard = /if\(tile\._closing\)/.test(code);
    assert(hasGuard, '_closing guard present in tiling.js');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test error:', err.stack || err);
  process.exit(1);
});
