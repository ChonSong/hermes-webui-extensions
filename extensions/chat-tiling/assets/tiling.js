// Chat Tiling — multi-session tile grid with Core-authoritative #messages
// Stable API consumer: registerHermesSessionOpenHandler + renderTranscript
// Requires WebUI >= 2026-07.18 (the release that exposed the session-open hook)
//
// Architecture:
// - #messages is Core's single scroll owner (scrollTop, pagination, virtualization)
// - #msgInner is ONE DOM element physically moved between tiles (never ID-swapped)
// - Inactive tiles get a new empty .ext-tile-msg-inner with renderTranscript snapshot
// - Focused tile hosts the live #msgInner — NO renderTranscript on it
// - On hide/close: #msgInner is restored to #messages

(function(){
  'use strict';

  const T = {
    tiles: [], activeId: null, visible: false, _cols: 0, _rows: 0,
    _saved: null, _savedComposer: '', _savedModel: '', _w: null,
    _actGen: 0, _watcherGeneration: 0, _closing: new Set(),
    _msgInnerOriginalParent: null, _msgInnerOriginalNextSibling: null,
    _panelObs: null, _badgeObserver: null
  };

  const SVG_ICON = {
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    maximize: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6M4 14v6"/></svg>',
    twoCol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></svg>',
    fourCol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="4" height="7" rx="1"/><rect x="9" y="3" width="4" height="7" rx="1"/><rect x="14" y="3" width="4" height="7" rx="1"/><rect x="5" y="13" width="4" height="7" rx="1"/></svg>',
    sixCol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="4" height="7" rx="1"/><rect x="9" y="3" width="4" height="7" rx="1"/><rect x="16" y="3" width="4" height="7" rx="1"/><rect x="2" y="13" width="4" height="7" rx="1"/><rect x="9" y="13" width="4" height="7" rx="1"/><rect x="16" y="13" width="4" height="7" rx="1"/></svg>'
  };

  const EXT_CSS = `
.ext-tile{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden}
.ext-tile--focused{border-color:var(--accent)}
.ext-tile--maximized{grid-area:1/1/-1/-1!important;z-index:2}
.ext-tile--hidden{display:none}
.ext-tile-titlebar{display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border);background:var(--bg-secondary)}
.ext-tile-title{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:none;min-width:0}
.ext-tile-btn{background:none;border:1px solid transparent;border-radius:6px;color:var(--text);cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center;line-height:1;opacity:.7;transition:opacity .15s}
.ext-tile-btn:hover{opacity:1;background:var(--bg-hover)}
.ext-tile-btn-sq{width:24px;height:24px}
.ext-tile-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
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

  // ── Move #msgInner physically between tiles (preserves Core DOM) ──
  function moveMsgInnerTo(tile){
    const msgInner=document.getElementById('msgInner');
    if(!msgInner)return;
    const target=tile.el&&tile.el.querySelector('.ext-tile-body');
    if(!target)return;
    // Append #msgInner to the tile body
    target.appendChild(msgInner);
  }

  // ── Restore #msgInner to its original parent in #messages ──
  function restoreMsgInner(){
    const msgInner=document.getElementById('msgInner');
    if(!msgInner)return;
    if(T._msgInnerOriginalParent){
      if(T._msgInnerOriginalNextSibling){
        T._msgInnerOriginalParent.insertBefore(msgInner,T._msgInnerOriginalNextSibling);
      } else {
        T._msgInnerOriginalParent.appendChild(msgInner);
      }
    }else{
      const messages=document.getElementById('messages');
      if(messages)messages.appendChild(msgInner);
    }
  }

  // ── Create an empty msg-inner placeholder for snapshot rendering ──
  function createEmptyMsgInner(tile){
    const el=tile.el;
    if(!el)return null;
    const body=el.querySelector('.ext-tile-body');
    if(!body)return null;
    // Remove any existing empty placeholders
    body.querySelectorAll('.ext-tile-msg-inner').forEach(mi=>{
      if(mi.id!=='msgInner')mi.remove();
    });
    const newMi=document.createElement('div');
    newMi.className='ext-tile-msg-inner';
    body.appendChild(newMi);
    return newMi;
  }

  function renderSnapshot(t){
    if(!t.el)return;
    const msgInners=t.el.querySelectorAll('.ext-tile-msg-inner');
    let mi=null;
    for(const m of msgInners){
      if(m.id!=='msgInner'){mi=m;break;}
    }
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
    if(cols===1&&rows===1){
      grid.style.gridTemplateColumns='1fr';
      grid.style.gridTemplateRows='1fr';
    }else{
      grid.style.gridTemplateColumns=`repeat(${cols},1fr)`;
      grid.style.gridTemplateRows=`repeat(${rows},1fr)`;
    }
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

  // ── Focus switching ──
  async function focusTile(id,opts){
    opts=opts||{};
    const tile=tid(id);
    if(!tile)return;
    if(T.activeId===id)return;
    const gen=++T._actGen;
    const outgoing=at();
    if(outgoing)sc(outgoing);

    // Set activeId BEFORE rendering so snapshot goes to the unfocused tile
    T.activeId=id;
    T.tiles.forEach(t=>{if(t.el)t.el.classList.toggle('ext-tile--focused',t.id===id);});
    if(tile.el){
      tile.el.focus();
      tile.el.setAttribute('aria-label',`Chat tile ${id} — focused`);
    }

    if(outgoing&&outgoing.id!==id){
      moveMsgInnerTo(tile);
      rc(tile);
      createEmptyMsgInner(outgoing);
      renderSnapshot(outgoing);
    }else{
      moveMsgInnerTo(tile);
      rc(tile);
    }
    startWatcher();
    if(typeof window.syncTopbar==='function')window.syncTopbar();
    if(typeof window.syncModelChip==='function')window.syncModelChip();
    updateHeader(tile);
  }

  async function closeTile(id){
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

    // If this tile has #msgInner, restore it before removing
    if(tile.el){
      const mi=tile.el.querySelector('#msgInner');
      if(mi)restoreMsgInner();
    }

    // Remove from state
    const removed=T.tiles.splice(idx,1)[0];
    if(removed.el)removed.el.remove();

    // If we were focused, move focus
    if(T.activeId===id){
      T.activeId=null;
      if(T.tiles.length>0){
        focusTile(T.tiles[0].id);
      }else{
        hideGrid();
      }
    }
  }

  async function closeAll(){
    // If ANY cancel is refused, preserve ALL tiles
    const busyTiles=T.tiles.filter(t=>t.busy&&t.activeStreamId);
    if(busyTiles.length>0){
      const results=await Promise.all(busyTiles.map(t=>window.cancelSessionStream({streamId:t.activeStreamId,sessionId:t.sid})));
      if(results.some(r=>!r))return; // Refused — preserve all
    }
    // All clear — close everything
    hideGrid();
  }

  async function hideGrid(){
    if(!T.visible)return;
    T.visible=false;
    stopWatcher();
    // Restore #msgInner to #messages
    restoreMsgInner();
    // Show #messages
    const messages=document.getElementById('messages');
    if(messages)messages.style.display='';
    // Hide grid
    const grid=document.getElementById('ext-tile-grid');
    if(grid)grid.classList.remove('ext-tile-grid--active');
    // Remove all tiles
    T.tiles.forEach(t=>{if(t.el)t.el.remove();});
    T.tiles=[];
    T.activeId=null;
    // Reset S to the saved session
    if(T._saved){
      const s=getS();
      if(s){
        s.session=T._saved.session;
        s.messages=T._saved.messages;
        s.busy=T._saved.busy;
        s.activeStreamId=T._saved.activeStreamId;
      }
      if(typeof window.renderMessages==='function')window.renderMessages();
      T._saved=null;
    }
    // Restore composer
    const composer=document.getElementById('msg');
    if(composer){
      composer.value=T._savedComposer||'';
      if(typeof window.autoResize==='function')window.autoResize();
    }
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

    // Save current Core state
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

    // Hide Core's #messages
    const messages=document.getElementById('messages');
    if(messages)messages.style.display='none';

    // Save #msgInner's original position
    const msgInner=document.getElementById('msgInner');
    if(msgInner){
      T._msgInnerOriginalParent=msgInner.parentNode;
      T._msgInnerOriginalNextSibling=msgInner.nextSibling;
    }

    // Create grid
    let grid=document.getElementById('ext-tile-grid');
    if(!grid){
      grid=document.createElement('div');
      grid.id='ext-tile-grid';
      if(messages&&messages.parentNode){
        messages.parentNode.insertBefore(grid,messages.nextSibling);
      }else{
        document.body.appendChild(grid);
      }
    }
    grid.classList.add('ext-tile-grid--active');
    applyLayout(cols,rows);

    // Build tiles
    const total=cols*rows;
    for(let i=0;i<total;i++){
      buildTile(i+1);
    }
    refreshTileGrid();

    // Focus first tile — move #msgInner to it
    if(T.tiles.length>0){
      await focusTile(T.tiles[0].id);
    }

    // Apply any pending session to first tile if Core already has one
    if(s&&s.session&&T.tiles.length>0){
      const t=T.tiles[0];
      t.sid=s.session.session_id;
      t.session=s.session;
      t.messages=[...(s.messages||[])];
      t.busy=!!s.busy;
      t.activeStreamId=s.activeStreamId||null;
      updateHeader(t);
    }
  }

  async function switchLayout(cols,rows){
    const oldTiles=[...T.tiles];
    T.tiles.forEach(t=>{if(t.el)t.el.remove();});
    T.tiles=[];
    T._cols=cols;T._rows=rows;
    const grid=document.getElementById('ext-tile-grid');
    if(grid)applyLayout(cols,rows);
    const total=cols*rows;
    for(let i=0;i<total;i++){
      const t=buildTile(i+1);
      if(oldTiles[i]){
        t.sid=oldTiles[i].sid;
        t.session=oldTiles[i].session;
        t.messages=oldTiles[i].messages;
        t.busy=oldTiles[i].busy;
        t.activeStreamId=oldTiles[i].activeStreamId;
        t.cv=oldTiles[i].cv;
        t.mv=oldTiles[i].mv;
        updateHeader(t);
      }
    }
    refreshTileGrid();
    if(T.tiles.length>0){
      const focused=oldTiles.find(t=>t.id===T.activeId);
      await focusTile(focused?focused.id:T.tiles[0].id);
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
      }
      if(t){
        t._pending=true;
        t._pendingSid=sid;
      }
      return {destinationTileId:t?t.id:null};
    }

    if(opts.loaded){
      // Loaded: Core has loaded the session. Route to the reserved tile.
      if(!gs('auto_tile',true)){
        // Find the tile that was reserved during preload
        const pending=findPendingTile(sid);
        if(pending){
          pending._pending=false;
          pending._pendingSid=null;
          pending.sid=sid;
          pending.session=data;
          pending.messages=data?data.messages||[]:[];
          pending.busy=false;
          pending.activeStreamId=null;
          updateHeader(pending);
          focusTile(pending.id,{alreadyLoaded:true});
        }
        return {};
      }
      let t=findPendingTile(sid);
      if(!t)t=findEmptyTile();
      if(!t&&T.tiles.length>0){
        t=T.tiles[T.tiles.length-1];
      }
      if(t){
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
          focusTile(t.id,{alreadyLoaded:true});
        }else if(T.tiles.length===1){
          // First tile — already focused
        }
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
    if(typeof MutationObserver==='undefined')return;
    T._panelObs=new MutationObserver(()=>{
      const tb=document.getElementById('ext-tiling-toolbar');
      if(!tb)return;
      const isChat=main.classList.contains('chat')&&!main.classList.contains('showing-tasks');
      tb.classList.toggle('ext-tiling-toolbar--hidden',!isChat);
    });
    T._panelObs.observe(main,{attributes:true,attributeFilter:['class']});
    // Set initial state
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
})();
