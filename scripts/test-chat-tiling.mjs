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
  window.HermesExtensionSettings = { settingsForExtension: () => ({ get: (k) => k === 'auto_tile' ? true : undefined }) };

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
  window.loadSession = (sid, opts) => new Promise((res, rej) => {
    loadSessionResolvers.push({ sid, opts, res, rej });
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
    // Do NOT reassign the resolver array (that detaches it from the harness
    // closure and the stale rejection never runs). Capture references instead.
    const resolvers = h.loadSessionResolvers;
    const startLen = resolvers.length;
    h.window.focusTileExt(parseInt(tileA.dataset.tileId)); // schedules loadSession for A
    await settle();
    h.window.focusTileExt(parseInt(tileB.dataset.tileId)); // schedules loadSession for B
    await settle();
    const rA = resolvers[startLen];
    const rB = resolvers[startLen + 1];
    assert(!!rA && !!rB, 'both loadSession calls captured resolvers');
    // Resolve the LATEST (B) first — B owns S.
    setSession(h, 'sid-B', 'Session B', ['b-resolved']);
    rB.res();
    await settle();
    // Now reject the STALE A resolver: it must NOT clobber B's ownership.
    rA.rej(new Error('stale'));
    await settle();
    assert(h.S.session.session_id === 'sid-B', 'B owns S after stale A rejects');
    const tileBInner = tileB.querySelector('.ext-tile-msg-inner');
    assert(!tileBInner.textContent.includes('a-msg') && !tileBInner.textContent.includes('a-resolved'), 'stale A rejection did not clobber B tile content');
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

  // ═══════ S6: Timed-out preload releases its slot ═══════
  section('S6: Timed-out preload releases its slot');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a']);
    h.window.showGridExt(2, 1);
    await settle();
    // Shorten the preload timeout for this test (60ms).
    h.window.HermesExtensionSettings = {
      settingsForExtension: () => ({
        get: (k) => k === 'auto_tile' ? true : (k === 'preload_timeout_ms' ? 60 : undefined)
      })
    };
    // B preload reserves slot 2, then times out (no loaded event).
    const rb = h.handlerRegistration('sid-B', null, { preload: true });
    assert(!(rb && rb.cancel === true), 'B preload reserved a slot');
    await sleep(250); // > 60ms → timeout fires, reservation released
    // C must be able to reuse the released slot ({}), not get {cancel:true}.
    const rc = h.handlerRegistration('sid-C', null, { preload: true });
    assert(!(rc && rc.cancel === true), 'C reuses the slot released by timed-out B (not cancel)');
    // Now the grid is full again (A + C): D is rejected.
    const rd = h.handlerRegistration('sid-D', null, { preload: true });
    assert(rd && rd.cancel === true, 'D rejected when grid full again');
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

  // ═══════ S8: Active transcript has a scroll owner ═══════
  section('S8: Active transcript has a scroll owner');
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
    assert(msgInner.id === 'msgInner', 'active tile owns live msgInner');
    // The injected stylesheet must give the ACTIVE transcript the scroll owner
    // (a replacement scroller), since tiling disables Core's #messages scroller.
    const cssText = h.document.getElementById('ext-tile-css').textContent;
    const rule = /\.ext-tile-msg-inner\[id="msgInner"\]\s*\{[^}]*overflow-y\s*:\s*auto/i.test(cssText);
    assert(rule, 'scroll-owner rule exists for the active transcript');
    // A long transcript must be rendered inside that scrollable container
    // (Core renders into #msgInner, which is the active tile's msg-inner).
    h.window.renderTranscript(msgInner, longMsgs);
    assert(msgInner.querySelectorAll('.msg').length === 100, '100 messages rendered inside active transcript');
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
    composer.value = ''; // Core sets B's (empty) draft before loaded
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

  // ═══════ S13: Preload→loaded does not overwrite A's live surface/draft ═══════
  section('S13: Preload→loaded does not overwrite A live surface/draft');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a-msg']);
    h.window.showGridExt(2, 1);
    await settle();
    // A is focused and owns the live surface; give A a draft.
    const composer = h.document.getElementById('msg');
    composer.value = 'draft-a';
    // Core order: preload(B) fires BEFORE S mutates to B.
    h.handlerRegistration('sid-B', null, { preload: true });
    await settle();
    // Now Core mutates S to B, sets B's (empty) draft in the composer, and
    // fires loaded(B).
    setSession(h, 'sid-B', 'Session B', ['b-msg']);
    composer.value = ''; // Core sets B's empty draft
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileA = tiles[0], tileB = tiles[1];
    const bodyA = tileA.querySelector('.ext-tile-msg-inner').textContent;
    const bodyB = tileB.querySelector('.ext-tile-msg-inner').textContent;
    assert(tileA.querySelector('.ext-tile-title').textContent === 'Session A', 'tile A title stays Session A');
    assert(bodyA.includes('a-msg') && !bodyA.includes('b-msg'), 'tile A body shows A, not B');
    assert(bodyB.includes('b-msg'), 'tile B body shows B');
    assert(composer.value === '', 'B focused with empty draft after load (A draft preserved in tile A)');
    // Refocus A: it must restore A's draft, not B's.
    h.window.focusTileExt(parseInt(tileA.dataset.tileId));
    await settle();
    assert(composer.value === 'draft-a', 'refocusing A restores A draft (not B draft)');
    // Refocus B: it must restore B's (empty) draft, not A's.
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    assert(composer.value === '', 'refocusing B restores empty B draft (not A draft)');
  }

  // ═══════ S14: Exit with empty focused draft does not mix sessions ═══════
  section('S14: Exit with empty focused draft does not mix sessions');
  {
    const h = createFreshDom();
    setSession(h, 'sid-A', 'Session A', ['a-msg']);
    h.window.showGridExt(2, 1);
    await settle();
    // A has a draft in the composer before B loads.
    const composer = h.document.getElementById('msg');
    composer.value = 'draft-a';
    // Load B with an EMPTY draft (Core sets B's empty draft in the composer).
    h.handlerRegistration('sid-B', null, { preload: true });
    setSession(h, 'sid-B', 'Session B', ['b-msg']);
    composer.value = ''; // Core sets B's empty draft
    h.handlerRegistration('sid-B', h.S.session, { loaded: true });
    await settle();
    const tiles = Array.from(h.document.querySelectorAll('.ext-tile'));
    const tileB = tiles[1];
    h.window.focusTileExt(parseInt(tileB.dataset.tileId));
    await settle();
    // B's focused draft is empty — exiting tiling must restore B + empty draft,
    // NOT fall back to the pre-grid A draft.
    await h.window.hideGridExt();
    await settle();
    assert(h.S.session.session_id === 'sid-B', 'restored B session');
    assert(h.document.getElementById('msg').value === '', 'empty B draft restored as empty (not A draft)');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
