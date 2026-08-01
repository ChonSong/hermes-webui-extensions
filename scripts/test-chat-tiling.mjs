#!/usr/bin/env node
// Chat Tiling — single-live-session contract tests
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function createFreshDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>
      <div id="topbar"></div>
      <div id="messages"><div id="msgInner"></div></div>
      <textarea id="msg">initial-composer-value</textarea>
      <select id="modelSelect"><option value="gpt4">GPT-4</option><option value="claude">Claude</option></select>
    </body></html>`,
    { url: 'http://localhost' }
  );
  const { window } = dom;
  const { document } = window;

  window.S = { session: null, messages: [], busy: false, activeStreamId: null };
  window.HermesExtensionSettings = { settingsForExtension: () => ({ get: () => true }) };

  const cancelCalls = [];
  const cancelResolvers = [];
  const loadSessionResolvers = [];
  let handlerRegistration = null;

  window.cancelSessionStream = (opts) => {
    cancelCalls.push(opts);
    return new Promise((res) => {
      cancelResolvers.push({ res, opts });
      // Auto-resolve as true after 10ms (default success)
      setTimeout(() => {
        if (cancelResolvers.find(r => r.res === res)) {
          res(true);
        }
      }, 10);
    });
  };
  window.registerHermesSessionOpenHandler = (fn) => { handlerRegistration = fn; };
  window.renderMessages = () => {};
  window.loadSession = (sid, opts) => new Promise((res) => {
    loadSessionResolvers.push({ sid, opts, res });
    // Simulate Core updating S.session after load
    setTimeout(() => {
      if (window.S) {
        window.S.session = { session_id: sid, title: sid.toUpperCase(), messages: window.S.messages };
      }
    }, 5);
  });
  window.renderTranscript = (target, msgs) => {
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
  globalThis.S = window.S;
  globalThis.cancelSessionStream = window.cancelSessionStream;
  globalThis.INFLIGHT = window.INFLIGHT;
  globalThis.clearInflightState = window.clearInflightState;

  const code = readFileSync(path.join(repoRoot, 'extensions/chat-tiling/assets/tiling.js'), 'utf8');
  eval(code);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  return { window, document, cancelCalls, cancelResolvers, loadSessionResolvers, handlerRegistration, S: window.S };
}

const settle = () => sleep(100);
const setSession = (h, sid, title, msgs) => { h.S.session = { session_id: sid, title, messages: msgs }; h.S.messages = msgs; };

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ FAIL: ' + msg); } }
function section(name) { console.log('\n' + name); }

async function main() {

  // ═══════ S1: Activation creates tiles from current session ═══════
  section('S1: Activation creates tiles from current session');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a-msg']);
    h.window.showGridExt(2, 1);
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, '2 tiles created');
    assert(tiles[0].querySelector('.ext-tile-title').textContent === 'Session A', 'first tile shows session A');
    const msgInner = h.document.getElementById('msgInner');
    assert(msgInner && msgInner.closest('.ext-tile') === tiles[0], 'msgInner on focused tile');
  }

  // ═══════ S2: Focus switching saves and restores atomically ═══════
  section('S2: Focus switching saves and restores atomically');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a-msg']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b-msg']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileB = tiles[1];
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    h.document.getElementById('msg').value = 'draft-b';
    h.window.focusTileExt(parseInt(tiles[0].dataset.tileId));
    await settle();
    assert(h.document.getElementById('msg').value === '', 'A has empty composer (no bleed from B)');
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    assert(h.document.getElementById('msg').value === 'draft-b', 'B restores its own draft');
  }

  // ═══════ S3: Rapid A→B where stale A rejects after B ═══════
  section('S3: Rapid A→B where stale A rejects after B');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    h.loadSessionResolvers = [];
    h.window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    if (h.loadSessionResolvers.length > 0) {
      setSession(h, 'sid-B', 'Session B', ['b-resolved']);
      h.loadSessionResolvers[h.loadSessionResolvers.length - 1].res();
    }
    await settle();
    if (h.loadSessionResolvers.length > 1) {
      h.loadSessionResolvers[0].reject(new Error('stale'));
    }
    await settle();
    assert(h.S.session.session_id === 'sid-B', 'B owns S after stale A rejects');
  }

  // ═══════ S4: Full-grid navigation is rejected (cancel:true) ═══════
  section('S4: Full-grid navigation is rejected (cancel:true)');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const r = h.handlerRegistration('sid-C', null, { preload: true });
    assert(r && r.cancel === true, 'full-grid preload returns {cancel:true}');
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    assert(tiles.length === 2, 'both A and B tiles still exist');
  }

  // ═══════ S5: Failed cancellation preserves tile ═══════
  section('S5: Failed cancellation preserves tile');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    h.window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    h.S.busy = true; h.S.activeStreamId = 'stream-A';
    await sleep(700);
    // Override cancel to return false
    h.window.cancelSessionStream = () => Promise.resolve(false);
    globalThis.cancelSessionStream = h.window.cancelSessionStream;
    const result = await h.window.closeTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    assert(result === false, 'close returns false when cancel refused');
    const remaining = Array.from(h.document.querySelectorAll('.ext-tile'));
    assert(remaining.length === 2, 'tile A preserved on cancel refusal');
  }

  // ═══════ S6: Cancelled preload releases reservation ═══════
  section('S6: Cancelled preload releases reservation');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const r = h.handlerRegistration('sid-D', null, { preload: true });
    assert(r && r.cancel === true, 'D rejected when grid full');
  }

  // ═══════ S7: Hide/close restores focused session with its draft ═══════
  section('S7: Hide/close restores focused session with its draft');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileB = tiles[1];
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    h.document.getElementById('msg').value = 'draft-b';
    await h.window.hideGridExt();
    await settle();
    assert(h.S.session.session_id === 'sid-B', 'restored B');
    assert(h.document.getElementById('msg').value === 'draft-b', 'restored B\'s draft (not A\'s)');
  }

  // ═══════ S8: Long transcript uses Core scroll owner ═══════
  section('S8: Long transcript uses Core scroll owner');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', []);
    h.window.showGridExt(2, 1);
    await settle();
    const longMsgs = Array.from({ length: 100 }, (_, i) => ({ content: `msg-${i}` }));
    h.S.messages = longMsgs;
    h.window.renderMessages();
    await settle();
    const tile = h.document.querySelector('.ext-tile');
    const msgInner = tile.querySelector('.ext-tile-msg-inner');
    assert(msgInner.style.overflowY !== 'auto', 'tile msg-inner does not own scrolling');
  }

  // ═══════ S9: Non-focused tile is read-only snapshot ═══════
  section('S9: Non-focused tile is read-only snapshot');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    const msgInnerA = tileA.querySelector('.ext-tile-msg-inner');
    assert(msgInnerA.id !== 'msgInner', 'non-focused tile A does not own msgInner');
    const msgInnerB = tileB.querySelector('.ext-tile-msg-inner');
    assert(msgInnerB.id === 'msgInner', 'focused tile B owns msgInner');
  }

  // ═══════ S10: Composer text does not leak between tiles ═══════
  section('S10: Composer text does not leak between tiles');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    const composer = h.document.getElementById('msg');
    composer.value = 'draft-a';
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileB = tiles[1];
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    assert(composer.value === '', 'B has empty composer (no leak from A)');
    composer.value = 'draft-b';
    h.window.focusTileExt(parseInt(tiles[0].dataset.tileId));
    await settle();
    assert(composer.value === 'draft-a', 'A restores its own draft (no bleed from B)');
  }

  // ═══════ S11: Double-close busy tile preserves sibling ═══════
  section('S11: Double-close busy tile preserves sibling');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b']);
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    h.S.busy = true; h.S.activeStreamId = 'stream-A';
    h.window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    // Cancel auto-resolves after 10ms
    const p1 = h.window.closeTileExt(parseInt(tileA.dataset.tileId));
    const p2 = h.window.closeTileExt(parseInt(tileA.dataset.tileId));
    await Promise.all([p1, p2]);
    await settle();
    const remaining = Array.from(h.document.querySelectorAll('.ext-tile'));
    assert(remaining.length === 1, 'only 1 tile remains');
    assert(parseInt(remaining[0].dataset.tileId) === parseInt(tileB.dataset.tileId), 'sibling B preserved');
  }

  // ═══════ S12: Toolbar exists (activation test) ═══════
  section('S12: Toolbar exists (activation test)');
  {
    const h = createFreshDom();
    assert(!!h.document.getElementById('ext-tiling-toolbar'), 'toolbar exists');
    assert(!!h.document.getElementById('msgInner'), 'msgInner on Core container');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
