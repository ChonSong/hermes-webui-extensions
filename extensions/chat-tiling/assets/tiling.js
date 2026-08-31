// Chat Tiling — multi-session tile grid with overlay architecture
// Stable API consumer: registerHermesSessionOpenHandler + renderTranscript + loadSession
// Requires WebUI >= 2026-07.18 (the release that exposed the session-open hook)
//
// Architecture (single-live-session):
// - #messages is Core's single scroll owner — never hidden, never mutated
// - #msgInner stays in #messages always — never detached, never moved
// - Grid is an absolute-positioned overlay inside #messages
// - Focused tile = transparent window showing live #msgInner beneath
// - Non-focused tiles = opaque renderTranscript snapshots covering #msgInner
// - focusTile() calls loadSession(tile.sid) to swap Core's session state
// - switchLayout() rearranges grid only — doesn't touch #msgInner
// - hideGrid() removes overlay — focused tile's session stays as live session

(function(){
  'use strict';

  // Timeout for focus operations — a hung loadSession blocks all later focus/hide
  // forever. This bounds the wait and settles to a deterministic error.
  const FOCUS_TIMEOUT_MS = 10000;

  const T = {
    tiles: [], activeId: null, visible: false, _cols: 0, _rows: 0,
    _saved: null, _savedComposer: '', _savedModel: '', _w: null,
    _watcherGeneration: 0, _focusGen: 0, _closing: new Set(),
    _panelObs: null, _badgeObserver: null,
    _focusOp: Promise.resolve(), _opGen: 0
  };

  // ── Operation queue ──
  // Every operation (focus, close, layout, hide) enqueues through _focusOp.
  // _opGen is incremented per operation; DOM/state commits are guarded by
  // `if (capturedGen !== T._opGen) return;` so stale ops discard their results.
  // Each operation races against FOCUS_TIMEOUT_MS to prevent indefinite hangs.
  function enqueueOp(fn){
    T._opGen++;
    const myOpGen=T._opGen;
    const chained=T._focusOp.then(()=>{
      // Race fn against timeout
      return new Promise((resolve)=>{
        let settled=false;
        const timeoutId=setTimeout(()=>{
          if(!settled){settled=true;resolve({timedOut:true});}
        },FOCUS_TIMEOUT_MS);
        Promise.resolve(fn(myOpGen)).then((result)=>{
          if(!settled){settled=true;clearTimeout(timeoutId);resolve(result);}
        },(err)=>{
          if(!settled){settled=true;clearTimeout(timeoutId);resolve({error:err});}
        });
      });
    });
    T._focusOp=chained.catch(()=>{});
    return chained;
  }

  const SVG_ICON = {
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    maximize: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6M4 14v6"/></svg>',
    twoCol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></svg>',
    fourCol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="4" height="7" rx="1"/><rect x="9" y="3" width="4" height="7" rx="1"/><rect x="14" y="3" width="4" height="7" rx="1"/><rect x="5" y="13" width="4" height="7" rx="1"/></svg>',
    sixCol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="4" height="7" rx="1"/><rect x="9" y="3" width="4" height="7" rx="1"/><rect x="16" y="3" width="4" height="7" rx="1"/><rect x="2" y="13" width="4" height="7" rx="1"/><rect x="9" y="13" width="4" height="7" rx="1"/><rect x="16" y="13" width="4" height="7" rx="1"/></svg>'
  };

  const EXT_CSS = `
#ext-tile-grid{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;display:grid;gap:0}
.ext-tile{position:absolute;min-width:0;min-height:0;background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.ext-tile--focused{border-color:var(--accent);background:transparent;pointer-events:none}
.ext-tile--focused .ext-tile-msg-inner{display:none}
.ext-tile--focused .ext-tile-titlebar{pointer-events:auto}
.ext-tile:not(.ext-tile--focused){background:var(--bg);pointer-events:auto}
.ext-tile--maximized{grid-area:1/1/-1/-1!important;z-index:2}
.ext-tile--hidden{display:none}
.ext-tile-titlebar{display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border);background:var(--bg-secondary)}
.ext-tile--focused .ext-tile-titlebar{background:transparent}
.ext-tile-title{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:none;min-width:0}
.ext-tile-btn{background:none;border:1px solid transparent;border-radius:6px;color:var(--text);cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center;line-height:1;opacity:.7;transition:opacity .15s}
.ext-tile-btn:hover{opacity:1;background:var(--bg-hover)}
.ext-tile-btn-sq{width:24px;height:24px}
.ext-tile-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.ext-tile-msg-inner{flex:1;min-height:0;padding:0;display:flex;flex-direction:column}
.ext-tile-sidebar-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;font-size:10px;font-weight:700;line-height:16px;color:var(--bg);background:var(--accent)}
.ext-tile--focused .ext-tile-sidebar-badge{display:none}
#ext-tiling-toolbar{display:flex;gap:4px;align-items:center;margin-left:auto}
#ext-tiling-toolbar.ext-tiling-toolbar--hidden{display:none}
.ext-toolbar-btn{background:none;border:1px solid transparent;border-radius:6px;color:var(--text-secondary);cursor:pointer;padding:4px 8px;display:flex;align-items:center;justify-content:center;line-height:1;opacity:.7;transition:opacity .15s;font-size:12px;white-space:nowrap}
.ext-toolbar-btn:hover{opacity:1;background:var(--bg-hover)}
@media(pointer:coarse){.ext-tile-btn,.ext-toolbar-btn{min-width:44px;min-height:44px}}
  `;

  function injectCss(){
    if(document.getElementById('ext-tiling-css'))return;
    const style=document.createElement('style');
    style.id='ext-tiling-css';
    style.textContent=EXT_CSS;
    document.head.appendChild(style);
  }

  function getS(){return window.S;}

  function gs(key,def){
    if(window.HermesExtensionSettings&&window.HermesExtensionSettings.settingsForExtension){
      return window.HermesExtensionSettings.settingsForExtension('chat-tiling').get(key);
    }
    return def;
  }

  function at(){
    if(T.activeId===null)return null;
    return T.tiles.find(t=>t.id===T.activeId)||null;
  }

  function tid(id){
    return T.tiles.find(t=>t.id===id)||null;
  }

  function bySid(sid){
    return T.tiles.find(t=>t.sid===sid)||null;
  }

  function rc(tile){
    if(!tile)return;
    const composer=document.getElementById('msg');
    if(composer){
      composer.value=tile.cv||'';
      if(typeof window.autoResize==='function')window.autoResize();
    }
    const modelSelect=document.getElementById('modelSelect');
    if(modelSelect&&tile.mv)modelSelect.value=tile.mv;
  }

  function sc(tile){
    if(!tile)return;
    const composer=document.getElementById('msg');
    if(composer)tile.cv=composer.value;
    const modelSelect=document.getElementById('modelSelect');
    if(modelSelect)tile.mv=modelSelect.value;
  }

  function updateHeader(t){
    if(!t.el)return;
    const title=t.el.querySelector('.ext-tile-title');
    if(title){
      title.textContent=t.session?t.session.title||t.sid:'Empty tile';
      title.title=t.sid||'';
    }
  }

  function updateBadgeCounts(){
    const rows=document.querySelectorAll('.session-item[data-sid]');
    rows.forEach(row=>{
      const sid=row.getAttribute('data-sid');
      const count=T.tiles.filter(t=>t.sid===sid&&t.busy).length;
      let badge=row.querySelector('.ext-tile-sidebar-badge');
      if(count>0){
        if(!badge){
          badge=document.createElement('span');
          badge.className='ext-tile-sidebar-badge';
          const titleEl=row.querySelector('.session-item-title');
          if(titleEl&&titleEl.parentNode===row){
            titleEl.parentNode.insertBefore(badge,titleEl.nextSibling);
          } else {
            row.appendChild(badge);
          }
        }
        badge.textContent=count;
      } else if(badge){
        badge.remove();
      }
    });
  }

  // ── Render snapshot into a tile's body ──
  function renderSnapshot(t){
    if(!t.el)return;
    const mi=t.el.querySelector('.ext-tile-msg-inner');
    if(!mi)return;
    if(typeof window.renderTranscript==='function'){
      window.renderTranscript(mi,t.messages||[],{skipEmpty:false});
    }
  }

  function makeTileEls(t,id){
    const el=document.createElement('div');
    el.className='ext-tile';
    el.dataset.tileId=id;
    el.setAttribute('role','region');
    el.setAttribute('tabindex','-1');
    el.innerHTML=`
      <div class="ext-tile-titlebar">
        <span class="ext-tile-title">Empty tile</span>
        <button class="ext-tile-btn ext-tile-btn-sq ext-tile-maximize-btn" aria-label="Maximize tile" title="Maximize">${SVG_ICON.maximize}</button>
        <button class="ext-tile-btn ext-tile-btn-sq ext-tile-close-btn" aria-label="Close tile" title="Close">${SVG_ICON.close}</button>
      </div>
      <div class="ext-tile-body">
        <div class="ext-tile-msg-inner"></div>
      </div>
    `;
    el.addEventListener('click',()=>focusTile(t.id));
    el.querySelector('.ext-tile-close-btn').addEventListener('click',async(e)=>{
      e.stopPropagation();
      await closeTile(t.id);
    });
    el.querySelector('.ext-tile-maximize-btn').addEventListener('click',(e)=>{
      e.stopPropagation();
      toggleMax(t.id);
    });
    return el;
  }

  function applyLayout(cols,rows){
    const grid=document.getElementById('ext-tile-grid');
    if(!grid)return;
    grid.style.gridTemplateColumns=cols===1?'1fr':`repeat(${cols},1fr)`;
    grid.style.gridTemplateRows=rows===1?'1fr':`repeat(${rows},1fr)`;
    // Position tiles using grid placement
    T.tiles.forEach((t,i)=>{
      if(!t.el)return;
      const row=Math.floor(i/cols);
      const col=i%cols;
      t.el.style.gridArea=`${row+1}/${col+1}`;
    });
  }

  function refreshTileGrid(){
    const grid=document.getElementById('ext-tile-grid');
    if(!grid)return;
    Array.from(grid.children).forEach(c=>{
      if(!c.classList.contains('ext-tile'))return;
      const still=T.tiles.find(t=>t.id===parseInt(c.dataset.tileId));
      if(!still)c.remove();
    });
    T.tiles.forEach(t=>{
      if(t.el&&t.el.parentElement!==grid)grid.appendChild(t.el);
      if(t.el)t.el.classList.toggle('ext-tile--focused',t.id===T.activeId);
    });
  }

  function buildTile(id){
    const t={id,sid:null,session:null,messages:[],busy:false,activeStreamId:null,cv:'',mv:'',el:null,_pending:false,_pendingSid:null,maximized:false};
    t.el=makeTileEls(t,id);
    T.tiles.push(t);
    const grid=document.getElementById('ext-tile-grid');
    if(grid)grid.appendChild(t.el);
    return t;
  }

  function toggleMax(id){
    const t=tid(id);
    if(!t||!t.el)return;
    t.maximized=!t.maximized;
    t.el.classList.toggle('ext-tile--maximized',t.maximized);
    document.querySelectorAll('.ext-tile').forEach(o=>{
      if(o!==t.el)o.classList.toggle('ext-tile--hidden',t.maximized);
    });
  }

  function findEmptyTile(){
    return T.tiles.find(t=>!t.sid&&!t._pending);
  }

  function findPendingTile(sid){
    return T.tiles.find(t=>t._pendingSid===sid&&t._pending);
  }

  // ── Focus switching — calls loadSession() to swap Core session ──
  // Serialized through _focusOp queue with timeout. Each focus captures _opGen
  // and only commits state/DOM if still current after async settles.
  function focusTile(id,opts){
    opts=opts||{};
    return enqueueOp((myOpGen)=>{
      return _focusTileImpl(id,opts,myOpGen);
    });
  }

  async function _focusTileImpl(id,opts,myOpGen){
    opts=opts||{};
    const tile=tid(id);
    if(!tile)return;
    if(T.activeId===id)return;
    // Capture focus generation — bail if a newer focus supersedes us
    T._focusGen++;
    const myGen=T._focusGen;
    const outgoing=at();
    if(outgoing)sc(outgoing);

    // If tile has a session, swap Core's session via loadSession.
    // Skip when alreadyLoaded (Core already has this session — loaded hook).
    if(tile.sid&&typeof window.loadSession==='function'&&!opts.alreadyLoaded){
      try{
        await window.loadSession(tile.sid);
      }catch(e){
        // A newer focus may have superseded us — don't roll back over a newer winner.
        if(myGen!==T._focusGen)return;
        // Own the rollback with the same operation identity.
        T._focusGen++;
        const rbGen=T._focusGen;
        if(outgoing&&outgoing.sid){
          try{await window.loadSession(outgoing.sid);}catch(_){}
        }
        // After await, check if a newer focus superseded us
        if(rbGen!==T._focusGen)return;
        return;
      }
      // After await, check if a newer focus superseded us
      if(myGen!==T._focusGen)return;
    }

    // Commit only if this operation is still current
    if(myOpGen!==T._opGen)return;

    // Set activeId AFTER loadSession succeeds (Finding 4: no authority split on failure)
    T.activeId=id;

    // Update tile classes: focused = transparent, others = opaque with snapshot
    T.tiles.forEach(t=>{
      if(!t.el)return;
      const isFocused=t.id===id;
      t.el.classList.toggle('ext-tile--focused',isFocused);
      if(!isFocused){
        renderSnapshot(t);
      }
    });

    if(tile.el){
      tile.el.focus();
      tile.el.setAttribute('aria-label',`Chat tile ${id} — focused`);
    }

    rc(tile);
    startWatcher();
    if(typeof window.syncTopbar==='function')window.syncTopbar();
    if(typeof window.syncModelChip==='function')window.syncModelChip();
    updateHeader(tile);
  }

  // ── Close tile — enqueued through operation queue ──
  // Waits for pending focus on this tile to settle, then removes it.
  // Uses _closing set for single-flight guard (no myOpGen check — close is
  // atomic, not discardable).
  function closeTile(id){
    return enqueueOp(()=>{
      return _closeTileImpl(id);
    });
  }

  async function _closeTileImpl(id){
    const tile=tid(id);
    if(!tile)return;
    const idx=T.tiles.indexOf(tile);
    if(idx<0)return;

    if(tile.busy&&tile.activeStreamId){
      if(T._closing.has(id))return;
      T._closing.add(id);
      try{
        const ok=await window.cancelSessionStream({streamId:tile.activeStreamId,sessionId:tile.sid});
        T._closing.delete(id);
        if(!ok)return; // Cancellation refused — preserve tile
      }catch(e){
        T._closing.delete(id);
        return;
      }
    }

    // Remove from state
    const removed=T.tiles.splice(idx,1)[0];
    if(removed.el)removed.el.remove();

    // Invalidate pending focus on the removed tile
    T._focusGen++;

    // If we were focused, move focus
    if(T.activeId===id){
      T.activeId=null;
      if(T.tiles.length>0){
        await focusTile(T.tiles[0].id);
      }else{
        await hideGrid();
      }
    }
  }

  // ── Close all — refuse if any busy (no partial cancel) ──
  function closeAll(){
    const busyTiles=T.tiles.filter(t=>t.busy&&t.activeStreamId);
    if(busyTiles.length>0){
      // Refuse if any tile is busy — concurrent cancellation can partially
      // succeed, leaving some streams canceled and others not.
      return Promise.resolve();
    }
    return hideGrid();
  }

  // ── Hide grid — enqueued through operation queue ──
  // Awaits in-flight focus before removing presentation. DOM commit only if
  // operation is still current.
  function hideGrid(){
    return enqueueOp((myOpGen)=>{
      return _hideGridImpl(myOpGen);
    });
  }

  async function _hideGridImpl(myOpGen){
    if(!T.visible)return;
    T.visible=false;
    stopWatcher();

    // Invalidate any pending focus so a late focus success/failure is a no-op
    T._focusGen++;

    // Commit only if this operation is still current
    if(myOpGen!==T._opGen)return;

    // Core already has the focused tile's session loaded (it was the last one focused).
    // No need to write tile cache over Core's current S — that would republish stale state.
    // Leave composer/model untouched — they're already canonical from the live focused tile.
    // Just remove the overlay and let Core's current S stand.

    // Remove the overlay grid
    const grid=document.getElementById('ext-tile-grid');
    if(grid)grid.remove();

    // Reset state
    T.tiles=[];
    T.activeId=null;

    T._saved=null;
    T._savedComposer='';
    T._savedModel='';
  }

  function startWatcher(){
    stopWatcher();
    T._watcherGeneration++;
    const myGen=T._watcherGeneration;
    T._w=setInterval(()=>{
      if(myGen!==T._watcherGeneration){stopWatcher();return;}
      const t=at();
      if(!t||T.activeId===null){stopWatcher();return;}
      const s=getS();
      if(!s||!s.session)return;
      // Fenced projection: only copy S state if this tile owns the session
      if(s.session.session_id!==t.sid)return;
      if(s.messages&&s.messages.length>0)t.messages=[...s.messages];
      t.busy=!!s.busy;
      t.activeStreamId=s.activeStreamId||null;
    },300);
  }

  function stopWatcher(){
    if(T._w){clearInterval(T._w);T._w=null;}
  }

  async function showGrid(cols,rows){
    if(T.visible&&T._cols===cols&&T._rows===rows)return;
    if(T.visible){await switchLayout(cols,rows);return;}
    T._cols=cols;T._rows=rows;T.visible=true;

    // Save current Core state (for rollback if needed)
    const s=getS();
    if(s){
      T._saved={
        session:s.session,
        messages:s.messages,
        busy:s.busy,
        activeStreamId:s.activeStreamId
      };
    }
    // Save current composer/model
    const composer=document.getElementById('msg');
    if(composer)T._savedComposer=composer.value;
    const modelSelect=document.getElementById('modelSelect');
    if(modelSelect)T._savedModel=modelSelect.value;

    // Create grid as absolute overlay inside #messages (not hiding #messages)
    const messages=document.getElementById('messages');
    let grid=document.getElementById('ext-tile-grid');
    if(!grid){
      grid=document.createElement('div');
      grid.id='ext-tile-grid';
    }
    // Ensure grid is inside #messages
    if(messages&&grid.parentElement!==messages){
      messages.appendChild(grid);
    }
    applyLayout(cols,rows);

    // Build tiles
    const total=cols*rows;
    for(let i=0;i<total;i++){
      buildTile(i+1);
    }
    refreshTileGrid();

    // Seed tile 1 from captured live session state (Finding 1: activation seeding)
    const curS=getS();
    if(T.tiles.length>0&&curS&&curS.session){
      const t0=T.tiles[0];
      t0.sid=curS.session.session_id;
      t0.session=curS.session;
      t0.messages=curS.messages||[];
      t0.busy=!!curS.busy;
      t0.activeStreamId=curS.activeStreamId||null;
      t0.cv=T._savedComposer;
      t0.mv=T._savedModel;
      updateHeader(t0);
    }

    // Focus first tile
    if(T.tiles.length>0){
      await focusTile(T.tiles[0].id);
    }
  }

  // ── Switch layout — enqueued through operation queue ──
  // Refuses shrink if any excess tile is busy (no partial cancellation).
  // Does not remove the active tile — reorders survivors to retain it.
  function switchLayout(cols,rows){
    return enqueueOp((myOpGen)=>{
      return _switchLayoutImpl(cols,rows,myOpGen);
    });
  }

  async function _switchLayoutImpl(cols,rows,myOpGen){
    const newTotal=cols*rows;
    if(newTotal===T.tiles.length){
      // Same cardinality — just reposition existing tiles
      T._cols=cols;T._rows=rows;
      const grid=document.getElementById('ext-tile-grid');
      if(grid)applyLayout(cols,rows);
      refreshTileGrid();
      return;
    }

    // Capture old geometry BEFORE any mutation
    const oldCols=T._cols;
    const oldRows=T._rows;
    const oldTiles=T.tiles;
    const oldActiveId=T.activeId;
    const oldActiveTile=oldActiveId?oldTiles.find(t=>t.id===oldActiveId):null;

    const removedTiles=oldTiles.slice(newTotal);
    const survivingTiles=oldTiles.slice(0,newTotal);

    // Issue 1 fix: refuse shrink if any excess tile is busy — no partial cancel.
    // Concurrent cancellation can partially succeed, leaving some streams
    // canceled and others not. User must close busy tiles first via closeTile().
    const busyRemoved=removedTiles.filter(t=>t.busy&&t.activeStreamId);
    if(busyRemoved.length>0){
      return; // Refuse — no mutation
    }

    // Issue 4 fix: don't remove the active tile — reorder survivors to retain it.
    // If active tile is among removed tiles, swap it with the last survivor.
    let actualSurviving=survivingTiles;
    let actualRemoved=removedTiles;
    if(oldActiveTile&&!survivingTiles.includes(oldActiveTile)){
      // Active tile is being removed — swap with last survivor
      const lastSurv=survivingTiles[survivingTiles.length-1];
      const newSurviving=survivingTiles.filter(t=>t.id!==lastSurv.id);
      newSurviving.push(oldActiveTile);
      const newRemoved=removedTiles.filter(t=>t.id!==oldActiveTile.id);
      newRemoved.push(lastSurv);
      actualSurviving=newSurviving;
      actualRemoved=newRemoved;
    }

    // Issue 2 fix: settle successor focus BEFORE committing removal.
    // If the active tile was reordered, focus it first to confirm it loads.
    if(oldActiveTile&&!survivingTiles.includes(oldActiveTile)){
      // Active tile was swapped into survivors — confirm it loads
      try{
        await focusTile(oldActiveTile.id);
      }catch(e){
        // Successor focus failed — abort layout change
        return;
      }
      // Commit only if this operation is still current
      if(myOpGen!==T._opGen)return;
    }

    // Commit only if this operation is still current
    if(myOpGen!==T._opGen)return;

    // All clear — apply new geometry
    T._cols=cols;T._rows=rows;
    const grid=document.getElementById('ext-tile-grid');
    if(grid)applyLayout(cols,rows);

    // Remove excess tiles
    for(const rt of actualRemoved){
      if(rt.el)rt.el.remove();
    }

    // Keep tiles up to new count (preserve their authority)
    T.tiles=actualSurviving;

    // Build new empty tiles for any expansion
    const maxId=oldTiles.length>0?Math.max(...oldTiles.map(t=>t.id)):0;
    for(let i=oldTiles.length;i<newTotal;i++){
      buildTile(maxId+i-oldTiles.length+1);
    }

    // Re-append to grid
    T.tiles.forEach(t=>{if(grid&&t.el)grid.appendChild(t.el);});
    refreshTileGrid();

    // Restore activeId to the same tile object if it still exists
    if(oldActiveTile&&T.tiles.includes(oldActiveTile)){
      T.activeId=oldActiveTile.id;
      if(oldActiveTile.sid){
        await focusTile(oldActiveTile.id);
      }
    }else if(T.tiles.length>0){
      // Old active tile was removed — focus first tile with a session, or just first tile
      const withSession=T.tiles.find(t=>t.sid);
      await focusTile((withSession||T.tiles[0]).id);
    }
  }

  // ── Session-open handler (two-phase: preload → loaded) ──
  function sessionOpenHandler(sid,data,opts){
    opts=opts||{};
    if(!T.visible)return {};

    if(opts.preload){
      // Preload: Core is about to load a session. Reserve a slot.
      if(!gs('auto_tile',true))return {};
      let t=findPendingTile(sid);
      if(!t){
        t=findEmptyTile();
        if(!t){
          // No empty tiles — steal the oldest pending slot (timed-out preload)
          const pendingTiles=T.tiles.filter(t=>t._pending&&t._pendingSid!==sid);
          if(pendingTiles.length>0){
            t=pendingTiles[0]; // FIFO: replace oldest pending
          }
        }
      }
      if(t){
        t._pending=true;
        t._pendingSid=sid;
      }
      return {destinationTileId:t?t.id:null};
    }

    if(opts.loaded){
      // Loaded: Core has loaded the session. Route to the reserved tile.
      if(!gs('auto_tile',true))return {}; // auto_tile disabled — don't tile
      let t=findPendingTile(sid);
      if(!t)return {}; // No pending reservation for this session — ignore
      if(t.sid&&t.sid!==sid)return {}; // Already has a different session

      const isNew=!t.sid;
      t._pending=false;
      t._pendingSid=null;
      t.sid=sid;
      t.session=data;
      t.messages=data?data.messages||[]:[];
      t.busy=false;
      t.activeStreamId=null;
      updateHeader(t);
      if(isNew&&T.tiles.length>1){
        // Core already loaded this session (loaded hook). Skip redundant loadSession.
        focusTile(t.id, { alreadyLoaded: true });
      }
      updateBadgeCounts();
      return {};
    }

    return {};
  }

  // ── Initialization ──
  function init(){
    // Feature-detect required Core APIs
    if(!document.getElementById('msgInner'))return;
    if(typeof window.registerHermesSessionOpenHandler!=='function')return;
    if(typeof window.renderTranscript!=='function')return;

    injectCss();

    // Create toolbar
    const toolbar=document.createElement('div');
    toolbar.id='ext-tiling-toolbar';
    toolbar.innerHTML=`
      <button class="ext-toolbar-btn" data-layout="2" aria-label="Split in 2" title="Split into 2 tiles">${SVG_ICON.twoCol}<span style="margin-left:4px">2</span></button>
      <button class="ext-toolbar-btn" data-layout="4" aria-label="Split in 4" title="Split into 4 tiles">${SVG_ICON.fourCol}<span style="margin-left:4px">4</span></button>
      <button class="ext-toolbar-btn" data-layout="6" aria-label="Split in 6" title="Split into 6 tiles">${SVG_ICON.sixCol}<span style="margin-left:4px">6</span></button>
      <button class="ext-toolbar-btn" data-layout="close" aria-label="Close tiling" title="Close tiling">${SVG_ICON.close}</button>
    `;
    toolbar.querySelectorAll('[data-layout]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        const layout=btn.dataset.layout;
        if(layout==='close'){
          await hideGrid();
        }else{
          await showGrid(parseInt(layout),1);
        }
      });
    });

    const titlebar=document.querySelector('.app-titlebar');
    if(titlebar){
      titlebar.appendChild(toolbar);
    }

    // Register session-open handler
    window.registerHermesSessionOpenHandler(sessionOpenHandler);
    window.handlerRegistration = sessionOpenHandler;

    // Panel gating
    initPanelGating();

    // Badge observer
    initBadgeObserver();
  }

  function initPanelGating(){
    const main=document.querySelector('main.main');
    if(!main)return;
    if(typeof window.MutationObserver==='undefined')return;
    T._panelObs=new window.MutationObserver(()=>{
      const tb=document.getElementById('ext-tiling-toolbar');
      if(!tb)return;
      const isChat=main.classList.contains('chat')&&!main.classList.contains('showing-tasks');
      tb.classList.toggle('ext-tiling-toolbar--hidden',!isChat);
    });
    T._panelObs.observe(main,{attributes:true,attributeFilter:['class']});
    const isChat=main.classList.contains('chat')&&!main.classList.contains('showing-tasks');
    const tb=document.getElementById('ext-tiling-toolbar');
    if(tb)tb.classList.toggle('ext-tiling-toolbar--hidden',!isChat);
  }

  function initBadgeObserver(){
    const sessionList=document.querySelector('.session-list');
    if(!sessionList)return;
    if(typeof MutationObserver==='undefined')return;
    T._badgeObserver=new MutationObserver((mutations)=>{
      // Bounded: disconnect, apply, reconnect
      T._badgeObserver.disconnect();
      try{
        updateBadgeCounts();
      }finally{
        T._badgeObserver.observe(sessionList,{childList:true,subtree:true});
      }
    });
    T._badgeObserver.observe(sessionList,{childList:true,subtree:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }

  // Exports for testing
  window.showGridExt=showGrid;
  window.hideGridExt=hideGrid;
  window.focusTileExt=focusTile;
  window.closeTileExt=closeTile;
  window.closeAllExt=closeAll;
  window.chatTilingState=T;
  window.updateBadgeCounts=updateBadgeCounts;
})();