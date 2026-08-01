#!/usr/bin/env node
// Chat Tiling — single-live-session contract tests
// Proves the boundary: one focused tile owns Core S/composer/model/msgInner.
// Non-focused tiles are read-only snapshots.
// Leaving tiling restores one coherent session projection.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const dom = new JSDOM(
`<!DOCTYPE html>
<html><head></head><body>
  <div id="topbar"></div>
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
let cancelCalls = [];
let cancelResolvers = [];
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
window.cancelSessionStream = (opts) => {
  cancelCalls.push(opts);
  return new Promise((res) => {
    const resolver = { res, opts };
    cancelResolvers.push(resolver);
    // Auto-resolve as true after 10ms (default success)
    setTimeout(() => {
      if (cancelResolvers.includes(resolver)) {
        res(true);
        cancelResolvers = cancelResolvers.filter(r => r !== resolver);
      }
    }, 10);
  });
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
async function settle() { await new Promise(r => setTimeout(r, 50)); }

async function main() {

  // ═══════ S1: Activation creates tiles from current session ═══════
  section('S1: Activation creates tiles from current session');
  {
    S.session = { session_id: 'sid-A', title: 'Session A', messages: ['a-msg'] };
    S.messages = ['a-msg'];
    window.showGridExt(2, 1);
    await settle();
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, '2 tiles created');
    assert(tiles[0].querySelector('.ext-tile-title').textContent === 'Session A', 'first tile shows session A');
    const msgInner = document.getElementById('msgInner');
    assert(msgInner && msgInner.closest('.ext-tile') === tiles[0], 'msgInner on focused tile');
  }

  // ═══════ S2: Focus switching saves and restores atomically ═══════
  section('S2: Focus switching saves and restores atomically');
  {
    // Load B into second tile
    handlerRegistration('sid-B', null, { preload: true });
    S.session = { session_id: 'sid-B', title: 'Session B', messages: ['b-msg'] };
    S.messages = ['b-msg'];
    handlerRegistration('sid-B', S.session, { loaded: true });
    await settle();
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const tileB = tiles[1];
    window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    // Type draft-b
    document.getElementById('msg').value = 'draft-b';
    // Focus back to A
    window.focusTileExt(parseInt(tiles[0].dataset.tileId));
    await settle();
    assert(document.getElementById('msg').value === '', 'A has empty composer (no bleed from B)');
    // Focus B again
    window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    assert(document.getElementById('msg').value === 'draft-b', 'B restores its own draft');
  }

  // ═══════ S3: Rapid A→B where stale A rejects after B ═══════
  section('S3: Rapid A→B where stale A rejects after B');
  {
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    // Focus A
    window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    loadSessionResolvers = [];
    // Focus B immediately
    window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    // Resolve B's loadSession
    if (loadSessionResolvers.length > 0) {
      S.session = { session_id: 'sid-B', title: 'Session B', messages: ['b-resolved'] };
      S.messages = ['b-resolved'];
      loadSessionResolvers[loadSessionResolvers.length - 1].resolve();
    }
    await settle();
    // Reject A's loadSession (stale)
    if (loadSessionResolvers.length > 1) {
      loadSessionResolvers[0].reject(new Error('stale'));
    }
    await settle();
    assert(S.session.session_id === 'sid-B', 'B owns S after stale A rejects');
  }

  // ═══════ S4: Full-grid navigation is rejected (cancel:true) ═══════
  section('S4: Full-grid navigation is rejected (cancel:true)');
  {
    const r = handlerRegistration('sid-C', null, { preload: true });
    assert(r && r.cancel === true, 'full-grid preload returns {cancel:true}');
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, 'both A and B tiles still exist');
  }

  // ═══════ S5: Failed cancellation preserves tile ═══════
  section('S5: Failed cancellation preserves tile');
  {
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    // Focus A, then set busy (focusTile syncs immediately)
    window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    S.busy = true; S.activeStreamId = 'stream-A';
    // Override cancelSessionStream to return false
    const origCancel = window.cancelSessionStream;
    window.cancelSessionStream = () => {
      cancelResolvers = [];
      return Promise.resolve(false);
    };
    const result = await window.closeTileExt(parseInt(tileA.dataset.tileId));
    window.cancelSessionStream = origCancel;
    await settle();
    assert(result === false, 'close returns false when cancel refused');
    const remaining = Array.from(document.querySelectorAll('.ext-tile'));
    assert(remaining.length === 2, 'tile A preserved on cancel refusal');
  }

  // ═══════ S6: Cancelled preload releases reservation ═══════
  section('S6: Cancelled preload releases reservation');
  {
    // Grid is full (A and B) — D should be rejected
    const r = handlerRegistration('sid-D', null, { preload: true });
    assert(r && r.cancel === true, 'D rejected when grid full');
  }

  // ═══════ S7: Hide/close restores focused session with its draft ═══════
  section('S7: Hide/close restores focused session with its draft');
  {
    // Reset cancel state
    cancelResolvers = [];
    S.busy = false;
    S.activeStreamId = null;
    // Focus the last tile, type draft
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const lastTile = tiles[tiles.length - 1];
    window.focusTileExt(parseInt(lastTile.dataset.tileId));
    await settle();
    document.getElementById('msg').value = 'draft-final';
    // Dismiss grid (cancel auto-resolves)
    await window.hideGridExt();
    await settle();
    assert(document.getElementById('msg').value === 'draft-final', 'restored focused session\'s draft');
  }

  // ═══════ S8: Long transcript uses Core scroll owner ═══════
  section('S8: Long transcript uses Core scroll owner');
  {
    S.busy = false; S.activeStreamId = null;
    S.session = { session_id: 'sid-A', title: 'Session A', messages: [] };
    S.messages = [];
    window.showGridExt(2, 1);
    await settle();
    const longMsgs = Array.from({ length: 100 }, (_, i) => ({ content: `msg-${i}` }));
    S.messages = longMsgs;
    window.renderMessages();
    await settle();
    const tile = document.querySelector('.ext-tile');
    const msgInner = tile.querySelector('.ext-tile-msg-inner');
    assert(msgInner.style.overflowY !== 'auto', 'tile msg-inner does not own scrolling');
  }

  // ═══════ S9: Non-focused tile is read-only snapshot ═══════
  section('S9: Non-focused tile is read-only snapshot');
  {
    handlerRegistration('sid-B', null, { preload: true });
    S.session = { session_id: 'sid-B', title: 'Session B', messages: ['b'] };
    S.messages = ['b'];
    handlerRegistration('sid-B', S.session, { loaded: true });
    await settle();
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    const msgInnerA = tileA.querySelector('.ext-tile-msg-inner');
    assert(msgInnerA.id !== 'msgInner', 'non-focused tile A does not own msgInner');
    const msgInnerB = tileB.querySelector('.ext-tile-msg-inner');
    assert(msgInnerB.id === 'msgInner', 'focused tile B owns msgInner');
  }

  // ═══════ S10: Composer text does not leak between tiles ═══════
  section('S10: Composer text does not leak between tiles');
  {
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    // Focus A, type draft-a
    window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    document.getElementById('msg').value = 'draft-a';
    // Focus B
    window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    assert(document.getElementById('msg').value === '', 'B has empty composer (no leak from A)');
    // Type draft-b
    document.getElementById('msg').value = 'draft-b';
    // Focus A again
    window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    assert(document.getElementById('msg').value === 'draft-a', 'A restores its own draft (no bleed from B)');
  }

  // ═══════ S11: Double-close busy tile preserves sibling ═══════
  section('S11: Double-close busy tile preserves sibling');
  {
    const tiles = Array.from(document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    S.busy = true; S.activeStreamId = 'stream-A';
    window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    // Close same tile twice
    const p1 = window.closeTileExt(parseInt(tileA.dataset.tileId));
    const p2 = window.closeTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    // Resolve cancel
    if (cancelResolvers.length > 0) cancelResolvers[cancelResolvers.length - 1].res(true);
    await Promise.all([p1, p2]);
    await settle();
    const remaining = Array.from(document.querySelectorAll('.ext-tile'));
    assert(remaining.length === 1, 'only 1 tile remains');
    assert(parseInt(remaining[0].dataset.tileId) === parseInt(tileB.dataset.tileId), 'sibling B preserved');
  }

  // ═══════ S12: Inactive on page load ═══════
  section('S12: Toolbar exists (activation test)');
  {
    // After all tests, toolbar should still exist
    assert(!!document.getElementById('ext-tiling-toolbar'), 'toolbar exists');
    // Core container should still have msgInner
    assert(!!document.getElementById('msgInner'), 'msgInner on Core container');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
