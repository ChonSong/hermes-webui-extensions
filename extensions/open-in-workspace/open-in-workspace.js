(function () {
  'use strict';

  if (document.getElementById('ext-open-in-workspace--loaded')) return;
  var MARKER = document.createElement('meta');
  MARKER.id = 'ext-open-in-workspace--loaded';

  /* ── CSS ── */
  var style = document.createElement('style');
  style.textContent = [
    '.ext-ws-open-wrap{padding:4px 12px 8px}',
    '.ext-ws-open-btn{background:none;border:none;color:var(--blue);font-size:10px;cursor:pointer;padding:0;opacity:.7;display:inline-flex;align-items:center;gap:3px;white-space:nowrap}',
    '.ext-ws-open-btn:hover{opacity:1}',
    '.ext-ws-open-btn svg{width:12px;height:12px;flex-shrink:0}',
    '.ext-ws-foot-files{display:inline-flex;align-items:center;gap:2px;margin-right:4px;vertical-align:middle;opacity:0;transition:opacity .12s}',
    '.assistant-turn:hover .ext-ws-foot-files,.msg-foot:hover .ext-ws-foot-files{opacity:1}',
    '.ext-ws-foot-file{display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;color:var(--text2);font-size:9px;font-weight:500;cursor:pointer;position:relative;flex-shrink:0}',
    '.ext-ws-foot-file .ext-ws-tip{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:var(--surface3);color:var(--text1);font-size:11px;padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;z-index:100}',
    '.ext-ws-foot-file:hover .ext-ws-tip{opacity:1}',
  ].join('');
  document.head.appendChild(style);

  /* ── SVG icon (Lucide folder-open) ── */
  var FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 6a2 2 0 0 1 2-2h3.28a2 2 0 0 1 1.82 1.07l1.8 3.87A2 2 0 0 0 12.72 11H20a2 2 0 0 1 2 2v5"/></svg>';

  /* ── Safe file opener — suppress download fallback ── */
  function openInWorkspace(path) {
    if (!path) return;
    if (typeof openFile === 'function') {
      /* Temporarily neutralise the downloadFile fallback inside openFile's
         catch blocks so a failed API call shows an error instead of
         triggering a browser download. */
      var orig = window.downloadFile;
      window.downloadFile = function () {};          // no-op while openFile runs
      try { openFile(path); }                         // openFile is async but
      catch (_) { /* sync throw — safe to ignore */ } // the no-op protects it
      /* Restore after a tick so the async catch blocks inside openFile
         have already hit our no-op. */
      setTimeout(function () { window.downloadFile = orig; }, 2000);
    } else if (typeof openArtifactPath === 'function') {
      openArtifactPath(path);
    }
  }

  /* ── Extract file path from a tool card row's _tcData.args ── */
  function getFilePath(row) {
    var tcData = row._tcData;
    if (!tcData || !tcData.args) return null;
    var path = tcData.args.path || tcData.args.file_path || tcData.args.file || tcData.args.target || tcData.args.name;
    return (path && typeof path === 'string') ? path : null;
  }

  /* ── Feature 1: inject "Open in workspace" button into read_file tool cards ── */
  function injectOpenButton(row) {
    if (row.getAttribute('data-ext-ws-open')) return;
    var path = getFilePath(row);
    if (!path) return;
    row.setAttribute('data-ext-ws-open', '1');

    var detail = row.querySelector('.tool-card-detail');
    if (detail) {
      var wrap = document.createElement('div');
      wrap.className = 'ext-ws-open-wrap';
      var btn = document.createElement('button');
      btn.className = 'ext-ws-open-btn';
      btn.innerHTML = FOLDER_ICON;
      btn.appendChild(document.createTextNode(' Open in workspace'));
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openInWorkspace(path);
      });
      wrap.appendChild(btn);
      detail.appendChild(wrap);
    } else {
      var card = row.querySelector('.tool-card');
      if (card) {
        var wrap = document.createElement('div');
        wrap.className = 'ext-ws-open-wrap';
        wrap.style.padding = '2px 12px 8px';
        var btn = document.createElement('button');
        btn.className = 'ext-ws-open-btn';
        btn.innerHTML = FOLDER_ICON;
        btn.appendChild(document.createTextNode(' Open in workspace'));
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openInWorkspace(path);
        });
        wrap.appendChild(btn);
        card.appendChild(wrap);
      }
    }
  }

  /* ── Collect unique file paths from all write/patch/read tool cards in a turn ── */
  var FILE_TOOL_NAMES = { write_file: 1, patch: 1, read_file: 1 };

  function collectTurnFilePaths(turn) {
    var seen = {};
    var paths = [];
    var cards = turn.querySelectorAll('.tool-card-row');
    for (var i = 0; i < cards.length; i++) {
      var toolName = cards[i].getAttribute('data-tool-name');
      if (!toolName || !FILE_TOOL_NAMES[toolName]) continue;
      var path = getFilePath(cards[i]);
      if (path && !seen[path]) {
        seen[path] = true;
        paths.push(path);
      }
    }
    return paths;
  }

  /* ── Feature 2: inject numbered file-change chips into the last msg-foot of a turn ── */
  function injectFootFiles(turn) {
    if (turn.getAttribute('data-ext-ws-foot')) return;
    var paths = collectTurnFilePaths(turn);
    if (paths.length === 0) return;

    var foots = turn.querySelectorAll('.msg-foot');
    if (foots.length === 0) return;

    var foot = foots[foots.length - 1];
    turn.setAttribute('data-ext-ws-foot', '1');

    var container = document.createElement('span');
    container.className = 'ext-ws-foot-files';

    for (var i = 0; i < paths.length; i++) {
      (function (path, num) {
        var chip = document.createElement('span');
        chip.className = 'ext-ws-foot-file';
        chip.textContent = num;

        var tip = document.createElement('span');
        tip.className = 'ext-ws-tip';
        var parts = path.split('/');
        tip.textContent = parts[parts.length - 1];
        chip.appendChild(tip);

        chip.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openInWorkspace(path);
        });

        container.appendChild(chip);
      })(paths[i], i + 1);
    }

    var actions = foot.querySelector('.msg-actions');
    if (actions) {
      foot.insertBefore(container, actions);
    } else {
      foot.appendChild(container);
    }
  }

  /* ── Process a single assistant turn ── */
  function processTurn(turn) {
    var readCards = turn.querySelectorAll('.tool-card-row[data-tool-name="read_file"]');
    for (var i = 0; i < readCards.length; i++) {
      injectOpenButton(readCards[i]);
    }
    setTimeout(function () {
      injectFootFiles(turn);
    }, 100);
  }

  /* ── MutationObserver on chat container ── */
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      if (!added || added.length === 0) continue;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches('.assistant-turn')) {
          processTurn(node);
        }
        if (node.querySelectorAll) {
          var turns = node.querySelectorAll('.assistant-turn');
          for (var k = 0; k < turns.length; k++) {
            processTurn(turns[k]);
          }
        }
      }
    }
  });

  /* ── Process existing turns on startup ── */
  function processExisting() {
    var turns = document.querySelectorAll('.assistant-turn');
    for (var i = 0; i < turns.length; i++) {
      processTurn(turns[i]);
    }
  }

  /* ── Start ── */
  function start() {
    document.head.appendChild(MARKER);
    var chat = document.querySelector('main') || document.body;
    observer.observe(chat, { childList: true, subtree: true });
    processExisting();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
