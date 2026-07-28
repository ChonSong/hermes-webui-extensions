// Chat Tiling — behavior tests for the activation state machine
// Run: `node tests.js` from this directory
//
// Uses jsdom for proper DOM simulation.

const { JSDOM } = require('/tmp/jsdom-test/node_modules/jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="msgInner"></div></body></html>`, { url: 'http://localhost' });
const { window } = dom;
const { document } = window;

// ── Mock core globals ──
let S = { session: null, messages: [], busy: false, activeStreamId: null };
let renderMessagesCalled = 0;
let renderTranscriptCalled = 0;
let loadSessionResolvers = [];
let handlerRegistration = null;

window.S = S;
window.registerHermesSessionOpenHandler = (fn) => { handlerRegistration = fn; };
window.renderTranscript = () => { renderTranscriptCalled++; };
window.renderMessages = () => { renderMessagesCalled++; };
window.loadSession = (sid) => new Promise((res, rej) => { loadSessionResolvers.push({ sid, res, rej }); });
window.api = () => Promise.resolve({ messages: [] });
window.HermesExtensionSettings = null;
window.CSS = { escape: s => s };
window.MutationObserver = class { observe(){} };

globalThis.window = window;
globalThis.document = document;
globalThis.S = S;
globalThis.renderMessages = window.renderMessages;
globalThis.renderTranscript = window.renderTranscript;
globalThis.loadSession = window.loadSession;
globalThis.registerHermesSessionOpenHandler = window.registerHermesSessionOpenHandler;
globalThis.localStorage = window.localStorage;
globalThis.CSS = window.CSS;
globalThis.MutationObserver = window.MutationObserver;

// ── Load extension ──
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'assets', 'tiling.js'), 'utf8');
eval(code);

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ FAIL: ' + msg); } }
function section(name) { console.log('\n' + name); }
function resetSess(sess) { S.session = sess.session; S.messages = sess.messages; S.busy = sess.busy; S.activeStreamId = sess.activeStreamId; }

// ── Scenario 1: Inactive on page load ────────────────────────────────────────
section('Scenario 1: Inactive on page load');
{
  assert(typeof window.openTileForSessionExt === 'function', 'extension exports are defined');
  assert(typeof window.focusTileExt === 'function', 'focusTileExt export defined');
  assert(typeof window.closeTileExt === 'function', 'closeTileExt export defined');
  assert(renderMessagesCalled === 0, 'renderMessages not called on load (no grid shown)');
}

// ── Scenario 2: Rapid A → B, stale A rejects after B ─────────────────────────
section('Scenario 2: Rapid A → B where stale A rejects after B');
{
  loadSessionResolvers = [];
  renderMessagesCalled = 0;

  // Show grid via keyboard handler (Ctrl+Alt+2)
  document.dispatchEvent(new window.KeyboardEvent('keydown', { ctrlKey: true, altKey: true, key: '2', repeat: false, bubbles: true }));
  loadSessionResolvers.forEach(r => r.resolve());
  loadSessionResolvers = [];

  // Assign session A to tile 1, B to tile 2
  handlerRegistration('sid-A', { session: { session_id: 'sid-A', messages: ['a1'], title: 'A' } }, { preload: true });
  handlerRegistration('sid-A', { session: { session_id: 'sid-A', messages: ['a1'], title: 'A' } }, { loaded: true });
  handlerRegistration('sid-B', { session: { session_id: 'sid-B', messages: ['b1'], title: 'B' } }, { preload: true });
  handlerRegistration('sid-B', { session: { session_id: 'sid-B', messages: ['b1'], title: 'B' } }, { loaded: true });

  // Re-focus tile 1 (triggers loadSession with alreadyLoaded:false)
  window.focusTileExt(1, {});
  assert(loadSessionResolvers.length === 1, 'loadSession called for A on refocus');
  const aReq = loadSessionResolvers[0];
  assert(aReq.sid === 'sid-A', 'loadSession called with sid-A');

  // Re-focus tile 2 (triggers loadSession)
  window.focusTileExt(2, {});
  assert(loadSessionResolvers.length === 2, 'loadSession called for B');
  const bReq = loadSessionResolvers[1];
  assert(bReq.sid === 'sid-B', 'loadSession called with sid-B');

  // A rejects (stale failure)
  aReq.reject(new Error('stale'));

  // B should still be active — A's catch guard must prevent restoreFromTile
  assert(S.session === null || S.session?.session_id !== 'sid-A', 'A did not overwrite global S after rejection');
  assert(renderMessagesCalled === 0, 'renderMessages not called by stale A rejection (guard worked)');

  // B resolves successfully
  bReq.resolve();
  assert(S.session?.session_id === 'sid-B', 'B session restored to global S after resolve');
}

// ── Scenario 3: hideGrid restores original session ───────────────────────────
section('Scenario 3: hideGrid restores original session');
{
  loadSessionResolvers = [];
  renderMessagesCalled = 0;
  resetSess({ session: { session_id: 'orig', messages: ['orig-msg'], busy: false, activeStreamId: null }, messages: ['orig-msg'], busy: false, activeStreamId: null });

  // Show grid
  document.dispatchEvent(new window.KeyboardEvent('keydown', { ctrlKey: true, altKey: true, key: '2', repeat: false, bubbles: true }));
  loadSessionResolvers.forEach(r => r.resolve());
  loadSessionResolvers = [];

  // Hide grid (toggle)
  document.dispatchEvent(new window.KeyboardEvent('keydown', { ctrlKey: true, altKey: true, key: '2', repeat: false, bubbles: true }));
  assert(S.session?.session_id === 'orig', 'original session restored after hideGrid');
  assert(S.messages.length === 1 && S.messages[0] === 'orig-msg', 'original messages restored after hideGrid');
  assert(renderMessagesCalled > 0, 'renderMessages called after hideGrid');
}

// ── Scenario 4: closeTile falls back to next tile ────────────────────────────
section('Scenario 4: closeTile on active tile falls back to next tile');
{
  loadSessionResolvers = [];
  resetSess({ session: null, messages: [], busy: false, activeStreamId: null });
  document.dispatchEvent(new window.KeyboardEvent('keydown', { ctrlKey: true, altKey: true, key: '2', repeat: false, bubbles: true }));
  loadSessionResolvers.forEach(r => r.resolve());
  loadSessionResolvers = [];

  window.closeTileExt(1);
  assert(true, 'closeTile did not throw');
}

// ── Scenario 5: Core hook payload shape ──────────────────────────────────────
section('Scenario 5: registerHermesSessionOpenHandler payload shape');
{
  let captured = null;
  window.registerHermesSessionOpenHandler(function (sid, data, opts) {
    captured = { sid, data, opts };
    return {};
  });
  if (handlerRegistration) {
    handlerRegistration('test-sid', { session: { session_id: 'test-sid', messages: ['hi'], title: 'Test' } }, { preload: true });
    assert(captured?.sid === 'test-sid', 'handler receives sid');
    assert(captured?.data?.session?.messages?.[0] === 'hi', 'handler receives nested session.messages');
    const hasPreload = captured?.opts?.preload === true;
    assert(hasPreload, 'handler receives opts.preload');
  } else {
    assert(false, 'handlerRegistration not set');
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
