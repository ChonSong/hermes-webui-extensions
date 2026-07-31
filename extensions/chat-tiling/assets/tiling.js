// Chat Tiling — multi-session tile grid for Hermes WebUI
// Stable API consumer: registerHermesSessionOpenHandler + renderTranscript
// Requires WebUI >= 2026-07.18 (the release that shipped these hooks)

(()=>{
'use strict';

// ── Feature detection ──
function hasStableApi(){
  return !!document.getElementById('msgInner')
    && typeof window.registerHermesSessionOpenHandler==='function'
    && typeof window.renderTranscript==='function';
}

// ── CSS (inlined) ──
function injectCss(){
  if(document.getElementById('ext-tiling-css'))return;
  document.head.appendChild(Object.assign(document.createElement('style'),{id:'ext-tiling-css',textContent:`
#ext-tile-grid{position:relative;overflow:hidden;display:none;flex:1 1 0%;min-height:0;min-width:0;gap:4px;padding:4px;background:var(--bg)}
#ext-tile-grid.ext-tile-grid--active{display:grid;align-items:normal;justify-content:normal;border-top:2px solid var(--accent)}
body.ext-tiling-body #messages>:not(#ext-tile-grid):not([aria-live]):not([role=status]){display:none!important}
body.ext-tiling-body #messages{overflow:hidden}
.ext-tile{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden}
.ext-tile--hidden{display:none!important}
.ext-tile--focused{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent-bg-strong)}
.ext-tile--maximized{border-radius:0;border:none;grid-column:1/-1;grid-row:1/-1;z-index:1}
.ext-tile-header{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;gap:6px;flex-shrink:0;min-height:32px;background:var(--sidebar);color:var(--text);border-bottom:1px solid var(--border)}
.ext-tile-header-left{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.ext-tile-dot{width:7px;height:7px;border-radius:999px;background:var(--accent);box-shadow:0 0 0 2px var(--accent-bg);flex-shrink:0}
.ext-tile-dot[hidden]{display:none}
.ext-tile-title{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:none;min-width:0}
.ext-tile-header-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}
.ext-tile-btn{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:5px;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.ext-tile-btn[hidden]{display:none!important}
.ext-tile-btn:hover{background:var(--hover-bg);color:var(--text)}
.ext-tile-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.ext-tile-msg-inner{flex:1;min-height:0;overflow-y:auto;padding:0;scroll-behavior:smooth;display:flex;flex-direction:column}
@media (prefers-reduced-motion: no-preference){.ext-tile-msg-inner{scroll-behavior:smooth}}
.ext-tile-sidebar-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--accent);color:var(--accent-text,#fff);font-size:10px;font-weight:700;line-height:1;margin-left:4px;vertical-align:middle}
#ext-tiling-toolbar{display:none;flex-direction:row;align-items:center;gap:1px;margin-left:2px;padding:0 4px;height:28px;border-left:1px solid var(--border);position:relative}
#ext-tiling-toolbar.ext-tiling-toolbar--visible{display:flex}
.ext-toolbar-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;background:transparent;border-radius:6px;color:var(--muted);cursor:pointer;position:relative;transition:background .15s,color .15s;-webkit-app-region:no-drag}
.ext-toolbar-btn:hover{background:var(--hover-bg);color:var(--text)}
.ext-toolbar-btn.ext-toolbar-btn--active{background:var(--accent-bg);color:var(--accent)}
.ext-toolbar-btn svg{width:16px;height:16px}
.ext-toolbar-divider{width:1px;height:16px;margin:0 3px;background:var(--border);flex-shrink:0}
.ext-toolbar-btn[data-tooltip]:hover::after{content:attr(data-tooltip);position:absolute;top:100%;margin-top:4px;padding:4px 8px;border-radius:6px;background:var(--text);color:var(--bg);font-size:11px;white-space:nowrap;pointer-events:none;z-index:10000}
@media(pointer:coarse){.ext-tile-btn,.ext-toolbar-btn{min-width:44px;min-height:44px}}
@media(max-width:500px){#ext-tile-grid{grid-template-columns:1fr!important;grid-template-rows:auto!important}}
`}));
}

// ── State ──
const T={tiles:[],activeId:null,nextId:1,grid:null,tb:null,visible:false,_w:null,_tc:{},_saved:null,_savedComposer:null,_savedModel:null,pendingTile:null,pendingTimer:null,_actGen:0};
const tid=i=>T.tiles.find(t=>t.id===i),bySid=s=>T.tiles.find(t=>t.sid===s),at=()=>tid(T.activeId);
const gs=(k,d)=>{try{const w=window.HermesExtensionSettings;if(w){const x=w.settingsForExtension('chat-tiling');if(x.get(k)!=null)return x.get(k)}}catch(_){}return d};

// ── Composer save/restore ──
function sc(t){if(!t)return;const m=document.getElementById('msg');if(m)t.cv=m.value;const ms=document.getElementById('modelSelect');if(ms)t.mv=ms.value}
function rc(t){
  if(!t)return;
  const m=document.getElementById('msg');
  if(m)m.value=t.cv||'';
  if(typeof autoResize==='function')autoResize();
  const ms=document.getElementById('modelSelect');
  if(ms&&t.mv&&t.mv!==ms.value)ms.value=t.mv;
}

// ── SVG icons ──
const Svg={
max:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
unmax:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
close:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
tb2:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>',
tb4:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
tb6:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="5" height="8" rx="1"/><rect x="8.5" y="3" width="5" height="8" rx="1"/><rect x="15" y="3" width="5" height="8" rx="1"/><rect x="2" y="13" width="5" height="8" rx="1"/><rect x="8.5" y="13" width="5" height="8" rx="1"/><rect x="15" y="13" width="5" height="8" rx="1"/></svg>',
tbX:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};

// ── Tile element creation ──
function createTile(t){
  const el=document.createElement('div');
  el.className='ext-tile';el.tabIndex=-1;el.dataset.tileId=t.id;
  el.setAttribute('role','region');el.setAttribute('aria-label',`Chat tile ${t.id}`);
  el.innerHTML=`<div class="ext-tile-header"><div class="ext-tile-header-left"><span class="ext-tile-dot" hidden></span><span class="ext-tile-title"></span></div><div class="ext-tile-header-actions"><button class="ext-tile-btn ext-tile-maximize-btn" title="Maximize" aria-label="Maximize" aria-pressed="false">${Svg.max}</button><button class="ext-tile-btn ext-tile-unmaximize-btn" title="Restore" aria-label="Restore" aria-pressed="false" hidden>${Svg.unmax}</button><button class="ext-tile-btn ext-tile-close-btn" title="Close" aria-label="Close">${Svg.close}</button></div></div><div class="ext-tile-body"><div class="ext-tile-msg-inner"></div></div>`;
  el.querySelector('.ext-tile-maximize-btn').onclick=e=>{e.stopPropagation();toggleMax(t.id)};
  el.querySelector('.ext-tile-unmaximize-btn').onclick=e=>{e.stopPropagation();toggleMax(t.id)};
  el.querySelector('.ext-tile-close-btn').onclick=e=>{e.stopPropagation();closeTile(t.id)};
  el.querySelector('.ext-tile-body').onclick=()=>focusTile(t.id);
  el.querySelector('.ext-tile-header').onclick=e=>{if(!e.target.closest('.ext-tile-btn'))focusTile(t.id)};
  return el;
}

function updateHeader(t){
  const el=t.el||T.grid&&T.grid.querySelector(`.ext-tile[data-tile-id="${t.id}"]`);
  if(!el)return;
  const title=t.session?(t.session.display_title||t.session._state_db_title||t.session.title||'New Chat'):'';
  el.querySelector('.ext-tile-title').textContent=title||'Empty tile';
  el.querySelector('.ext-tile-dot').hidden=!t.busy;
}

// ── Focus switching ──
function focusTile(id,opts){
  opts=opts||{};
  const tile=tid(id);if(!tile)return;
  const gen=++T._actGen;
  // Save outgoing tile state
  if(!opts.alreadyLoaded&&T.activeId&&T.activeId!==id){const o=at();if(o){sc(o);if(typeof S!=='undefined'){o.messages=[...(S.messages||[])];o.busy=!!S.busy;o.activeStreamId=S.activeStreamId||null;o.session=S.session}}}
  // Swap msgInner ID
  const cur=document.getElementById('msgInner');if(cur)cur.removeAttribute('id');
  T.activeId=id;
  T.tiles.forEach(t=>{if(t.el)t.el.classList.toggle('ext-tile--focused',t.id===id)});
  const ni=tile.el&&tile.el.querySelector('.ext-tile-msg-inner');if(ni)ni.id='msgInner';
  tile.el&&tile.el.focus();
  tile.el&&tile.el.setAttribute('aria-label',`Chat tile ${id} — focused`);
  // Restore incoming tile
  if(!opts.alreadyLoaded){
    if(tile.sid&&typeof window.loadSession==='function'){
      window.loadSession(tile.sid,{skipExtHooks:true}).then(()=>{
        if(gen!==T._actGen)return; // stale activation, discard
        if(typeof S!=='undefined'){tile.messages=[...(S.messages||[])];tile.busy=!!S.busy;tile.activeStreamId=S.activeStreamId||null;tile.session=S.session}
        renderMsgs(tile);updateHeader(tile);
      }).catch(()=>{
        if(gen!==T._actGen)return; // stale activation, don't restore
        restoreFromTile(tile);
      });
    } else {
      restoreFromTile(tile);
    }
  }
  rc(tile);
  if(typeof syncTopbar==='function')syncTopbar();
  if(typeof syncModelChip==='function')syncModelChip();
  updateHeader(tile);startWatcher();
}

function restoreFromTile(tile){
  if(typeof S!=='undefined'){S.session=tile.session;S.messages=[...(tile.messages||[])];S.busy=!!tile.busy;S.activeStreamId=tile.activeStreamId||null}
  if(typeof renderMessages==='function')renderMessages();
}

// ── Open session in tile ──
function openTile(sid,data){
  if(!sid)return;const e=bySid(sid);if(e){focusTile(e.id);return}
  const t=T.tiles.find(t=>!t.sid&&!t._pending);if(!t){typeof showToast==='function'&&showToast('All tiles in use. Close one first.',3e3,'error');return}
  t.sid=sid;t.session=data||null;t.messages=(data&&data.messages)||[];t.cv='';t.mv=null;
  updateHeader(t);badge(sid,1);renderMsgs(t);focusTile(t.id);
  if(!t.messages.length&&sid){(async()=>{try{const f=await window.api(`/api/session?session_id=${encodeURIComponent(sid)}&resolve_model=0`);if(f&&f.messages){t.messages=f.messages||[];t.session=f;if(T.activeId===t.id&&typeof S!=='undefined'){S.messages=t.messages;S.session=t.session}renderMsgs(t);updateHeader(t)}}catch(_){}})()}
}

// ── Render messages ──
function renderMsgs(t){
  const mi=t.el&&t.el.querySelector('.ext-tile-msg-inner');if(!mi)return;
  window.renderTranscript(mi,t.messages||[],{skipEmpty:false});
  if(mi.scrollTop!==undefined){const atBot=mi.scrollHeight-mi.scrollTop-mi.clientHeight<50;if(atBot)mi.scrollTop=mi.scrollHeight}
}

// ── Maximize / Unmaximize ──
function toggleMax(id){
  const t=tid(id);if(!t)return;
  if(t.maximized){
    t.maximized=false;if(t.el){t.el.classList.remove('ext-tile--maximized');t.el.querySelector('.ext-tile-maximize-btn').hidden=false;const ub=t.el.querySelector('.ext-tile-unmaximize-btn');ub.hidden=true;ub.setAttribute('aria-pressed','false')}
    T.tiles.forEach(x=>{if(x.el)x.el.classList.remove('ext-tile--hidden')})
  } else {
    T.tiles.filter(x=>x.maximized).forEach(x=>{x.maximized=false;if(x.el){x.el.classList.remove('ext-tile--maximized','ext-tile--hidden');x.el.querySelector('.ext-tile-maximize-btn').hidden=false;const ub=x.el.querySelector('.ext-tile-unmaximize-btn');ub.hidden=true;ub.setAttribute('aria-pressed','false')}})
    t.maximized=true;if(t.el){t.el.classList.add('ext-tile--maximized');t.el.querySelector('.ext-tile-maximize-btn').hidden=true;t.el.querySelector('.ext-tile-unmaximize-btn').hidden=false;t.el.querySelector('.ext-tile-unmaximize-btn').setAttribute('aria-pressed','true')}
    T.tiles.forEach(x=>{if(x.el)x.el.classList.toggle('ext-tile--hidden',!x.maximized)})
  }
  refreshGrid();
}

// ── Close tile (async — returns true on success, false if preserved) ──
async function closeTile(id){
  const tile=tid(id);if(!tile)return true;
  if(tile._closing)return true; // idempotent — prevent double-close race
  tile._closing=true;
  // Phase 1: cancel in-flight stream (Core contract — preserve INFLIGHT on failure)
  if(tile.busy&&tile.activeStreamId&&typeof cancelSessionStream==='function'){
    try {
      const result=await cancelSessionStream({session_id:tile.session?tile.session.session_id:null,active_stream_id:tile.activeStreamId});
      if(result===false){tile._closing=false;return false} // cancellation refused — preserve tile
    } catch(_){
      tile._closing=false;return false; // cancellation failed — preserve tile and recovery state
    }
  }
  // Phase 2: clear ownership only on successful cancellation
  if(tile.session&&typeof INFLIGHT!=='undefined'&&INFLIGHT[tile.session.session_id]){
    delete INFLIGHT[tile.session.session_id];
    typeof clearInflightState==='function'&&clearInflightState(tile.session.session_id);
  }
  // Phase 3: re-find by id after await — array may have shifted
  const t=tid(id);if(!t)return true;
  const idx=T.tiles.indexOf(t);if(idx<0)return true;
  if(t.el){const mi=t.el.querySelector('.ext-tile-msg-inner');if(mi&&mi.id==='msgInner')mi.removeAttribute('id');t.el.remove()}
  T.tiles.splice(idx,1);
  if(t.maximized){T.tiles.forEach(x=>{x.maximized=false;if(x.el){x.el.classList.remove('ext-tile--hidden','ext-tile--maximized');x.el.querySelector('.ext-tile-maximize-btn').hidden=false;x.el.querySelector('.ext-tile-unmaximize-btn').hidden=true}})}
  if(t.sid)badge(t.sid,-1);
  if(T.activeId===id){T.activeId=null;const n=T.tiles[0];if(n)focusTile(n.id);else await hideGrid()}
  refreshGrid();tbActive();
  return true;
}

// ── Grid ──
function refreshGrid(){
  if(!T.grid)return;
  T.grid.classList.toggle('ext-tile-grid--empty',T.tiles.length===0);
  if(T._cols&&T._rows){T.grid.style.gridTemplateColumns=`repeat(${T._cols},1fr)`;T.grid.style.gridTemplateRows=`repeat(${T._rows},1fr)`}
}

// ── Busy watcher ──
function startWatcher(){stopWatcher();T._w=setInterval(()=>{
  const t=at();if(!t||T.activeId===null){stopWatcher();return}
  if(typeof S!=='undefined'){if(S.messages&&S.messages.length>0)t.messages=[...S.messages];t.busy=!!S.busy;t.activeStreamId=S.activeStreamId||null;if(!S.busy&&t.session)t.session=S.session}
  updateHeader(t);
},500)}
function stopWatcher(){T._w&&(clearInterval(T._w),T._w=null)}

// ── Sidebar badge ──
function badge(sid,delta){
  if(!sid)return;
  T._tc[sid]=(T._tc[sid]||0)+delta;
  applyBadges();
}

function applyBadges(){
  if(T._badgeObs)T._badgeObs.disconnect();
  document.querySelectorAll('.ext-tile-sidebar-badge').forEach(b=>b.remove());
  Object.entries(T._tc).forEach(([sid,count])=>{
    if(count<=0)return;
    if(!gs('show_sidebar_badges',true))return;
    const safeId=(typeof CSS!=='undefined'&&CSS.escape)?CSS.escape(sid):sid.replace(/[^a-zA-Z0-9_-]/g,'');
    const row=document.querySelector(`.session-item[data-sid="${safeId}"]`);
    if(!row)return;
    const b=document.createElement('span');
    b.className='ext-tile-sidebar-badge';
    b.textContent=count>9?'9+':String(count);
    (row.querySelector('.session-row-right')||row.querySelector('.session-meta')||row).appendChild(b);
  });
  if(T._badgeObs&&T._badgeSidebar)T._badgeObs.observe(T._badgeSidebar,{childList:true,subtree:true});
}

function initBadgeObserver(){
  T._badgeSidebar=document.querySelector('.session-list')||document.querySelector('[data-session-list]');
  if(!T._badgeSidebar)return;
  T._badgeObs=new MutationObserver(()=>applyBadges());
  T._badgeObs.observe(T._badgeSidebar,{childList:true,subtree:true});
}

// ── Show / Hide grid ──
async function showGrid(cols,rows){
  if(T.visible&&T._cols===cols&&T._rows===rows)return;
  if(T.visible)await closeAll();
  T._cols=cols;T._rows=rows;T.visible=true;
  if(typeof S!=='undefined'&&!T._saved){T._saved={...S};const cm=document.getElementById('msg');T._savedComposer=cm?cm.value:'';const ms=document.getElementById('modelSelect');T._savedModel=ms?ms.value:''}
  const o=document.getElementById('msgInner');if(o){o.removeAttribute('id');o.classList.add('messages-inner--idle')}
  document.body.classList.add('ext-tiling-body');
  T.grid.style.display='';T.grid.classList.add('ext-tile-grid--active');
  T.grid.style.gridTemplateColumns=`repeat(${cols},1fr)`;T.grid.style.gridTemplateRows=`repeat(${rows},1fr)`;
  await closeAll();
  for(let i=0;i<cols*rows;i++){
    const t={id:T.nextId++,sid:null,session:null,messages:[],busy:false,activeStreamId:null,maximized:false,_closing:false,_pending:false,el:null,cv:'',mv:null};
    T.tiles.push(t);t.el=createTile(t);T.grid.appendChild(t.el);updateHeader(t)
  }
  // Seed first tile from current session (BREAKAGE #1 fix — blank first activation)
  if(typeof S!=='undefined'&&S.session&&S.session.session_id&&T.tiles.length>0){
    const t=T.tiles[0];
    t.sid=S.session.session_id;t.session=S.session;t.messages=[...(S.messages||[])];t.busy=!!S.busy;t.activeStreamId=S.activeStreamId||null;
    t._pending=true; // mark as reserved so preload doesn't over-assign
    updateHeader(t);renderMsgs(t);
  }
  refreshGrid();T.tiles.length>0&&focusTile(T.tiles[0].id);
  tbActive();try{localStorage.setItem('hermes-ext-tiling-layout',`${cols}x${rows}`)}catch(_){}
}

async function hideGrid(){
  if(!T.visible&&!T._saved){tbActive();return}
  T.visible=false;stopWatcher();
  document.querySelectorAll('.ext-tile-msg-inner[id="msgInner"]').forEach(el=>el.removeAttribute('id'));
  const o=document.querySelector('#messages>.messages-inner--idle');if(o){o.id='msgInner';o.classList.remove('messages-inner--idle')}
  document.body.classList.remove('ext-tiling-body');
  // Save last tile's composer before closeAll destroys it — must snapshot first
  if(T.activeId){const la=at();if(la){sc(la);T._savedComposer=la.cv||'';T._savedModel=la.mv||''}}
  await closeAll();
  T.grid.style.display='none';T.grid.classList.remove('ext-tile-grid--active');
  // Restore S from pre-grid snapshot synchronously
  if(typeof S!=='undefined'){
    const s=T._saved;T._saved=null;
    if(s)Object.assign(S,s);else{S.session=null;S.messages=[];S.busy=false;S.activeStreamId=null}
    // Fire-and-forget Core native hydration (don't block on it)
    if(s&&s.session&&s.session.session_id&&typeof window.loadSession==='function'){
      window.loadSession(s.session.session_id,{skipExtHooks:true}).catch(()=>{})
    }
  }
  // Restore composer and model select
  const cm=document.getElementById('msg');if(cm)cm.value=T._savedComposer||'';
  const ms=document.getElementById('modelSelect');if(ms&&T._savedModel)ms.value=T._savedModel;
  T._savedComposer=null;T._savedModel=null;
  if(typeof renderMessages==='function')renderMessages();
  if(typeof syncTopbar==='function')syncTopbar();tbActive();
  try{localStorage.removeItem('hermes-ext-tiling-layout')}catch(_){}
}

async function closeAll(){
  // Phase 1: collect busy tiles and attempt cancellation (Core contract — preserve on failure)
  const busy=T.tiles.filter(t=>t.busy&&t.activeStreamId);
  const results=await Promise.allSettled(busy.map(t=>{
    if(typeof cancelSessionStream==='function'){
      return cancelSessionStream({session_id:t.session?t.session.session_id:null,active_stream_id:t.activeStreamId})
        .then(r=>{if(r===false)throw new Error('cancellation-refused');return t})
        .catch(e=>{throw e});
    }
    return Promise.resolve(t);
  }));
  const cancelled=new Set();
  results.forEach(r=>{if(r.status==='fulfilled')cancelled.add(r.value.id)});
  // Phase 2: only clear INFLIGHT for successfully cancelled busy tiles
  T.tiles.forEach(t=>{
    if(t.busy&&t.activeStreamId&&!cancelled.has(t.id)){
      // Cancellation failed — preserve tile. Leave INFLIGHT alone.
      return;
    }
    if(t.session&&typeof INFLIGHT!=='undefined'&&INFLIGHT[t.session.session_id]){
      if(cancelled.has(t.id)||!t.busy){
        delete INFLIGHT[t.session.session_id];
        typeof clearInflightState==='function'&&clearInflightState(t.session.session_id);
      }
    }
  });
  // Phase 3: remove only tiles that were either cancelled successfully or not busy
  const removable=T.tiles.filter(t=>cancelled.has(t.id)||!t.busy);
  const preserved=T.tiles.filter(t=>t.busy&&!cancelled.has(t.id));
  removable.forEach(t=>{
    if(t.el){const mi=t.el.querySelector('.ext-tile-msg-inner');if(mi&&mi.id==='msgInner')mi.removeAttribute('id');t.el.remove()}
  });
  T.tiles=[...preserved]; // keep failed-cancellation tiles
  if(preserved.length===0){T.activeId=null;T._tc={};document.querySelectorAll('.ext-tile-sidebar-badge').forEach(b=>b.remove())}
}

function initCapture(){
  window.registerHermesSessionOpenHandler(function(sid,data,opts){
    if(!T.visible)return {};
    if(opts&&opts.preload&&sid){
      if(!gs('auto_tile',true))return {};
      // Duplicate session in a tile already? Focus it, no-op
      const existing=bySid(sid);
      if(existing){focusTile(existing.id);return {}}
      // Find unreserved empty tile
      const t=T.tiles.find(t=>!t.sid&&!t._pending);
      if(!t)return {}; // grid full — skip, don't hijack active tile's destination
      if(T.tiles.some(x=>x.sid===sid))return {}; // paranoia check
      // Snapshot outgoing tile before core swaps S
      if(T.activeId){const o=at();if(o){sc(o);if(typeof S!=='undefined'){o.messages=[...(S.messages||[])];o.busy=!!S.busy;o.activeStreamId=S.activeStreamId||null;o.session=S.session}}}
      t._pending=true;
      T.pendingTile=t;
      // Move msgInner to pending tile so Core renders into the correct node
      if(t&&t.el){const cm=document.getElementById('msgInner');if(cm){cm.removeAttribute('id');const tgt=t.el.querySelector('.ext-tile-msg-inner');if(tgt)tgt.id='msgInner'}}
      // Safety: clear pending if loaded never fires
      clearTimeout(T.pendingTimer);
      T.pendingTimer=setTimeout(()=>{T.pendingTile=null},5000);
    }
    if(opts&&opts.loaded&&sid){
      if(!gs('auto_tile',true))return {};
      // Use pendingTile only if it hasn't been claimed by another session
      let t=T.pendingTile;
      if(t&&t.sid&&t.sid!==sid)t=null; // pendingTile was already assigned to another session
      if(!t)t=T.tiles.find(t=>!t.sid);
      T.pendingTile=null;clearTimeout(T.pendingTimer);
      if(t&&data){
        if(T.tiles.some(x=>x.sid===sid&&x!==t))return {};
        // BREAKAGE #2 fix: data IS the session object (Core invokes loaded with S.session, not a wrapper)
        // Messages live in S.messages, not data.messages
        t.sid=sid;t.session=data;t.messages=[...(S.messages||[])];t.cv='';t.mv=null;
        updateHeader(t);badge(sid,1);renderMsgs(t);
        focusTile(t.id,{alreadyLoaded:true});
        // BREAKAGE #3 fix: unwrap session from /api/session response in tile API
        if(!t.messages.length&&sid){(async()=>{try{const f=await window.api(`/api/session?session_id=${encodeURIComponent(sid)}&resolve_model=0`);if(f){const msgs=(f.session&&f.session.messages)||f.messages||[];t.messages=msgs;t.session=f.session||f;if(T.activeId===t.id&&typeof S!=='undefined'){S.messages=t.messages;S.session=t.session}renderMsgs(t);updateHeader(t)}}catch(_){}})()}
      }
    }
    return {};
  });
}

// ── Toolbar ──
function createToolbar(){
  const tb=document.createElement('div');tb.id='ext-tiling-toolbar';
  tb.innerHTML=`<button class="ext-toolbar-btn" data-tooltip="Split 2 (horizontal)" aria-label="Split in 2" data-layout="2x1">${Svg.tb2}</button><button class="ext-toolbar-btn" data-tooltip="Split 4 (2x2 corners)" aria-label="Split in 4" data-layout="2x2">${Svg.tb4}</button><button class="ext-toolbar-btn" data-tooltip="Split 6 (3x2 grid)" aria-label="Split in 6" data-layout="3x2">${Svg.tb6}</button><div class="ext-toolbar-divider"></div><button class="ext-toolbar-btn" data-tooltip="Close all tiles" aria-label="Close tiling" data-layout="close">${Svg.tbX}</button>`;
  // Set aria-pressed on layout buttons
  tb.querySelectorAll('.ext-toolbar-btn[data-layout]').forEach(btn=>{
    if(btn.dataset.layout!=='close')btn.setAttribute('aria-pressed','false');
  });
  const titlebar=document.querySelector('header.app-titlebar');if(titlebar)titlebar.appendChild(tb);else document.body.appendChild(tb);
  tb.querySelectorAll('.ext-toolbar-btn').forEach(btn=>{btn.addEventListener('click',async e=>{
    e.stopPropagation();const l=btn.dataset.layout;if(l==='close'){await hideGrid();return}
    const[c,r]=l.split('x').map(Number);
    if(T.visible&&T._cols===c&&T._rows===r)await hideGrid();else await showGrid(c,r)
  })});
  T.tb=tb;
}

function tbActive(){
  if(!T.tb)return;T.tb.classList.toggle('ext-tiling-toolbar--visible',true);
  T.tb.querySelectorAll('.ext-toolbar-btn').forEach(btn=>{
    if(btn.dataset.layout==='close')return;
    const[c,r]=btn.dataset.layout.split('x').map(Number);
    const active=T.visible&&T._cols===c&&T._rows===r;
    btn.classList.toggle('ext-toolbar-btn--active',active);
    btn.setAttribute('aria-pressed',String(active));
  })
}

// ── Keyboard ──
function initKeyboard(){
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.altKey&&!e.repeat){const m={1:[1,1],2:[2,1],4:[2,2],6:[3,2]};if(m[e.key]){e.preventDefault();const[c,r]=m[e.key];if(T.visible)hideGrid();else showGrid(c,r)}}
  })
}

// ── Compatibility exports ──
window.openTileForSessionExt=openTile;window.focusTileExt=focusTile;window.closeTileExt=closeTile;window.maximizeTileExt=toggleMax;window.unmaximizeTileExt=toggleMax;

// ── Init ──
function init(){
  if(!hasStableApi()){
    console.debug('[chat-tiling] stable API unavailable, skipping init');
    return;
  }
  injectCss();
  T.grid=document.createElement('div');T.grid.id='ext-tile-grid';T.grid.className='ext-tile-grid';T.grid.style.display='none';
  const mi=document.getElementById('msgInner');if(mi&&mi.parentNode)mi.parentNode.appendChild(T.grid);
  createToolbar();tbActive();initCapture();initKeyboard();initBadgeObserver();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
