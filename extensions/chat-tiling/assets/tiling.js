// Chat Tiling v1: saved-history snapshots only. Core owns the sole composer,
// navigation, approvals, sends and streams. No focus/rollback transaction.
(function(){
  'use strict';
  const T={tiles:[],visible:false,cols:2,rows:1,nextId:1,epoch:0,maximizedId:null,opening:false};
  let grid=null,cells=null,status=null,layoutGroup=null,launcher=null,panelObserver=null,sidTimer=null,sidebarHint=null;
  let savedNodes=[],returnFocus=null,observedSid=null;
  const sidebarPresses=new WeakMap();
  const layouts={2:[2,1],4:[2,2],6:[3,2]};
  const ICON_COMPARE='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>';
  function currentSid(){
    try{return typeof S!=='undefined'?S.session?.session_id||null:null;}catch(_){return null;}
  }
  function isPhone(){
    try{return !window.matchMedia('(min-width:641px)').matches;}catch(_){return false;}
  }
  function notice(text){
    if(status)status.textContent=text;
    // On phones the grid can sit behind the conversation drawer; surface the
    // message where the user is actually looking.
    if(isPhone()&&document.querySelector('.sidebar.mobile-open')&&typeof window.showToast==='function')window.showToast(text,3000);
  }
  function blockActivation(e){if(e.key==='Enter'||e.key===' ')e.stopPropagation();}
  function button(label,fn){
    const el=document.createElement('button');el.type='button';el.textContent=label;
    el.addEventListener('keydown',blockActivation);
    el.addEventListener('click',e=>{e.stopPropagation();fn();});
    return el;
  }
  function isChatView(){
    const main=document.querySelector('main');
    return !main||![...main.classList].some(c=>c.startsWith('showing-'));
  }
  function emptyCopy(){
    return isPhone()?'Tap Choose conversation, then pick one from the list.':'Click a conversation in the sidebar to add it here.';
  }
  function openPicker(){
    // Reveal Core's own conversation list with Core's own controls.
    if(isPhone()){
      const sidebar=document.querySelector('.sidebar');
      if(sidebar&&!sidebar.classList.contains('mobile-open')&&typeof window.toggleMobileSidebar==='function')window.toggleMobileSidebar();
      return;
    }
    if(typeof window.expandSidebar==='function')window.expandSidebar();
    // Land on Core's conversation filter so the user can narrow the list.
    document.querySelector('#panelChat .session-search input')?.focus();
  }
  function makeTile(){
    const t={id:T.nextId++,sid:null,title:'Empty snapshot',messages:[],generation:0,loading:false,error:null,el:null};
    const el=document.createElement('section');el.className='ext-tile';el.dataset.tileId=String(t.id);
    const head=document.createElement('div');head.className='ext-tile-titlebar';
    const open=button('Empty snapshot',()=>openTile(t.id));open.className='ext-tile-open';open.disabled=true;
    const expand=button('Expand',()=>toggleMax(t.id));expand.className='ext-tile-expand';
    const close=button('Close',()=>closeTile(t.id));close.className='ext-tile-close';close.setAttribute('aria-label','Close snapshot');
    head.append(open,expand,close);
    const body=document.createElement('div');body.className='ext-tile-body';
    const inner=document.createElement('div');inner.className='ext-tile-msg-inner';body.append(inner);
    const empty=document.createElement('div');empty.className='ext-tile-empty';
    const emptyText=document.createElement('p');
    const choose=button('Choose conversation',openPicker);choose.className='ext-tile-choose';
    empty.append(emptyText,choose);body.append(empty);
    const footer=document.createElement('div');footer.className='ext-tile-footer';
    const refresh=button('Refresh history',()=>refreshTile(t));refresh.className='ext-tile-refresh';
    footer.append(refresh,document.createElement('span'));
    el.append(head,body,footer);t.el=el;T.tiles.push(t);return t;
  }
  function paint(t){
    const open=t.el.querySelector('.ext-tile-open');open.textContent=t.title;
    open.disabled=!t.sid||t.loading;open.setAttribute('aria-label',t.sid?'Open '+t.title+' in normal chat':'Empty snapshot');
    t.el.querySelector('.ext-tile-refresh').disabled=!t.sid||t.loading;
    const label=t.el.querySelector('.ext-tile-footer span');
    label.textContent=t.loading?'Loading history…':t.error?'Refresh failed; showing saved snapshot':t.sid?'Saved history · open to chat':'Empty slot';
    const inner=t.el.querySelector('.ext-tile-msg-inner'),empty=t.el.querySelector('.ext-tile-empty');
    empty.hidden=!!t.sid;empty.querySelector('p').textContent=emptyCopy();
    if(t.sid&&t.messages.length)window.renderTranscript(inner,t.messages,{skipEmpty:false});
    else{inner.textContent=!t.sid?'':t.loading?'Loading history…':t.error?'History unavailable. Try Refresh history.':'No saved messages yet.';}
  }
  function render(){
    if(!cells)return;
    if(T.maximizedId!==null&&!T.tiles.some(t=>t.id===T.maximizedId))T.maximizedId=null;
    cells.replaceChildren(...T.tiles.map(t=>t.el));
    cells.classList.remove('ext-cols-2','ext-cols-3');cells.classList.add('ext-cols-'+T.cols);
    cells.classList.toggle('ext-tiling-expanded',T.maximizedId!==null);
    T.tiles.forEach(t=>{
      const max=T.maximizedId===t.id;
      t.el.hidden=T.maximizedId!==null&&!max;
      const expand=t.el.querySelector('.ext-tile-expand');
      expand.textContent=max?'Restore':'Expand';
      expand.setAttribute('aria-label',max?'Restore snapshot':'Expand snapshot');
      expand.setAttribute('aria-pressed',max?'true':'false');
      paint(t);
    });
    if(layoutGroup){
      const count=String(T.cols*T.rows);
      layoutGroup.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.count===count?'true':'false'));
    }
  }
  async function refreshTile(t){
    if(!t.sid)return;
    const generation=++t.generation,epoch=T.epoch;t.loading=true;t.error=null;paint(t);
    try{
      const res=await fetch('api/session?session_id='+encodeURIComponent(t.sid)+'&messages=1&resolve_model=0&msg_limit=30&expand_renderable=1',{credentials:'same-origin'});
      if(!res.ok)throw new Error('History request failed');
      const data=await res.json();
      if(!data?.session||data.session.session_id!==t.sid||!Array.isArray(data.session.messages))throw new Error('Invalid history response');
      if(epoch!==T.epoch||generation!==t.generation||!T.tiles.includes(t))return;
      t.title=data.session.title||t.sid;t.messages=data.session.messages.filter(m=>m&&m.role);
      t.error=null;
    }catch(_){
      if(epoch!==T.epoch||generation!==t.generation||!T.tiles.includes(t))return;
      t.error=true;
    }finally{
      if(epoch===T.epoch&&generation===t.generation&&T.tiles.includes(t)){t.loading=false;paint(t);}
    }
  }
  async function addSnapshot(sid){
    if(!T.visible||!sid)return false;
    let t=T.tiles.find(t=>t.sid===sid);
    if(t){t.el.querySelector('.ext-tile-open').focus();return true;}
    t=T.tiles.find(t=>!t.sid);
    // A closed card frees capacity without leaving an empty slot behind.
    if(!t&&T.tiles.length<T.cols*T.rows)t=makeTile();
    if(!t){notice('Close a snapshot or choose a larger layout to add another.');return false;}
    t.sid=sid;t.title='Conversation history';render();await refreshTile(t);return true;
  }
  function closeTile(id){
    const index=T.tiles.findIndex(t=>t.id===id);if(index<0)return;
    const t=T.tiles[index];
    ++t.generation;T.tiles.splice(index,1);
    if(T.maximizedId===id)T.maximizedId=null;
    if(!T.tiles.length){hideGrid();return;}
    render();
    const next=T.tiles[Math.min(index,T.tiles.length-1)];
    next.el.querySelector('.ext-tile-close').focus();
  }
  function toggleMax(id){T.maximizedId=T.maximizedId===id?null:id;render();}
  function saveAccessibility(){
    savedNodes=['messages','composerWrap'].map(id=>document.getElementById(id)).filter(Boolean).map(el=>({el,inert:el.hasAttribute('inert'),aria:el.getAttribute('aria-hidden')}));
    savedNodes.forEach(({el})=>{el.setAttribute('inert','');el.setAttribute('aria-hidden','true');});
  }
  function restoreAccessibility(){
    savedNodes.forEach(({el,inert,aria})=>{if(!inert)el.removeAttribute('inert');if(aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',aria);});
    savedNodes=[];
  }
  function showSidebarHint(){
    const list=document.getElementById('sessionList');
    document.querySelector('.sidebar')?.classList.add('ext-tiling-picking');
    if(!list||!list.parentNode)return;
    if(!sidebarHint){
      sidebarHint=document.createElement('div');sidebarHint.className='ext-tiling-sidebar-hint';sidebarHint.setAttribute('role','note');
      sidebarHint.textContent='Comparing history · choose a conversation to add it as a snapshot.';
    }
    if(sidebarHint.nextSibling!==list)list.parentNode.insertBefore(sidebarHint,list);
  }
  function hideSidebarHint(){
    document.querySelector('.sidebar')?.classList.remove('ext-tiling-picking');
    sidebarHint?.remove();
  }
  function hideGrid(focus=true){
    if(!T.visible)return;
    T.visible=false;++T.epoch;T.tiles.forEach(t=>{++t.generation;t.loading=false;});
    grid.hidden=true;document.getElementById('mainChat')?.classList.remove('ext-tiling-browsing');
    restoreAccessibility();hideSidebarHint();launcher.setAttribute('aria-expanded','false');
    if(sidTimer){clearInterval(sidTimer);sidTimer=null;}
    if(focus){const target=returnFocus?.isConnected?returnFocus:launcher;target?.focus();}
  }
  async function openTile(id){
    const t=T.tiles.find(t=>t.id===id);if(!t?.sid||t.loading||T.opening)return;
    T.opening=true;hideGrid(false);
    try{
      // Normal public navigation only. No force, no opts shim, no rollback,
      // no composer writes even if Core resolves a failed navigation.
      await window.loadSession(t.sid);
    }catch(_){
      if(typeof window.showToast==='function')window.showToast('Could not open conversation. Use the normal chat controls to retry.');
    }finally{T.opening=false;}
  }
  async function showGrid(cols=2,rows=1){
    if(!isChatView())return;
    const count=cols*rows;if(!layouts[count])return;
    if(T.tiles.filter(t=>t.sid).length>count){notice('Close snapshots before reducing the layout.');render();return;}
    T.cols=cols;T.rows=rows;const opening=!T.visible;
    while(T.tiles.length>count){const t=T.tiles.find(t=>!t.sid);if(!t)break;++t.generation;T.tiles.splice(T.tiles.indexOf(t),1);}
    while(T.tiles.length<count)makeTile();
    if(!T.visible){
      T.visible=true;++T.epoch;returnFocus=document.activeElement;saveAccessibility();
      document.getElementById('mainChat')?.classList.add('ext-tiling-browsing');grid.hidden=false;
      launcher.setAttribute('aria-expanded','true');observedSid=currentSid();showSidebarHint();
      sidTimer=setInterval(()=>{const sid=currentSid();if(sid!==observedSid){hideGrid(false);}},300);
    }
    render();notice('History snapshots · choose conversations to compare.');
    // Reopening retains cached snapshots; refresh is explicit. No Core load.
    if(!T.tiles.some(t=>t.sid)){const sid=currentSid();if(sid)await addSnapshot(sid);}
    // Move focus only when the grid opens; a layout switch keeps it in place.
    if(T.visible&&opening){
      const populated=T.tiles.find(t=>t.sid);
      (populated?populated.el.querySelector('.ext-tile-open'):T.tiles[0]?.el.querySelector('.ext-tile-choose'))?.focus();
    }
  }
  function sidebarSnapshot(e){
    if(!T.visible)return;
    if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;
    if(e.type.startsWith('pointer')&&e.pointerType==='touch')return;
    if(e.type.startsWith('pointer')&&e.button!==0)return;
    const row=e.target.closest?.('.session-item[data-sid]');if(!row)return;
    // Preserve native actions, lineage controls and batch selection. Core row
    // navigation starts on pointerup/touchend, before click; capture those
    // gestures so comparison never accidentally navigates or saves a draft.
    if(row.querySelector('.session-select-cb')||e.target.closest('button,input,a,[role="button"],.session-actions,.session-menu,.session-select-cb-wrapper,.session-child-count,.session-child-sessions,.session-lineage-count,.session-lineage-segments'))return;
    const point=e.changedTouches?.[0]||e;
    if(e.type==='pointerdown'||e.type==='touchstart'){
      sidebarPresses.set(row,{x:point.clientX,y:point.clientY});e.stopImmediatePropagation();return;
    }
    if(e.type==='pointerup'||e.type==='touchend'){
      const start=sidebarPresses.get(row);sidebarPresses.delete(row);e.stopImmediatePropagation();
      if(!start||Math.hypot(point.clientX-start.x,point.clientY-start.y)>12)return;
    }
    if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
    if(e.type==='dblclick')return;
    addSnapshot(row.dataset.sid).then(added=>{
      // Core closes the phone drawer inside the navigation this gesture
      // replaced; close it here so the new card is visible.
      if(added&&isPhone()&&document.querySelector('.sidebar.mobile-open')&&typeof window.closeMobileSidebar==='function')window.closeMobileSidebar();
    });
  }
  function init(){
    const shell=document.querySelector('.messages-shell'),mainChat=document.getElementById('mainChat'),titlebar=document.querySelector('.app-titlebar');
    if(!shell||!mainChat||!titlebar||typeof window.renderTranscript!=='function'||typeof window.loadSession!=='function'||typeof window.registerHermesSessionOpenHandler!=='function')return;
    const style=document.createElement('style');style.id='ext-tiling-css';style.textContent=`
#ext-tiling-toolbar{position:absolute;right:max(12px,env(safe-area-inset-right,0px));top:calc(var(--app-titlebar-safe-top,0px) + 3px);height:32px;display:flex;align-items:center;-webkit-app-region:no-drag}
#ext-tiling-toolbar[hidden]{display:none}
.ext-tiling-launch{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;flex-shrink:0;background:none;border:none;border-radius:8px;color:var(--muted);cursor:pointer;-webkit-app-region:no-drag;-webkit-tap-highlight-color:transparent;transition:background-color .15s,color .15s}
.ext-tiling-launch:hover{background:var(--hover-bg);color:var(--text)}
.ext-tiling-launch[aria-expanded="true"]{background:var(--accent-bg);color:var(--accent-text)}
.ext-tiling-launch svg{display:block;pointer-events:none}
#mainChat.ext-tiling-browsing #messages{visibility:hidden}
#mainChat.ext-tiling-browsing #composerWrap{display:none!important}
#ext-tile-grid[hidden],.ext-tile[hidden],.ext-tile-empty[hidden]{display:none!important}
#ext-tile-grid{position:absolute;inset:0;z-index:10;background:var(--bg);display:flex;flex-direction:column;padding:8px;gap:8px;overflow:hidden;color:var(--text);container-type:inline-size}
.ext-tiling-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;flex-shrink:0}
.ext-tiling-controls>span{flex:1;min-width:120px;color:var(--muted)}
.ext-tiling-layout{display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;flex-shrink:0}
#ext-tile-grid .ext-tiling-layout button{border:none;border-radius:0;min-width:32px}
#ext-tile-grid .ext-tiling-layout button+button{border-left:1px solid var(--border)}
#ext-tile-grid .ext-tiling-layout button[aria-pressed="true"]{background:var(--accent-bg);color:var(--accent-text);font-weight:600}
.ext-tiling-cells{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(220px,1fr);gap:8px;flex:1;min-height:0;overflow:auto}
.ext-tiling-cells.ext-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.ext-tile{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg)}
.ext-tile-titlebar{display:flex;gap:4px;align-items:center;background:var(--surface);padding:6px;border-bottom:1px solid var(--border)}
.ext-tile-open{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-weight:600}
#ext-tile-grid button{font:inherit;font-size:12px;border:1px solid var(--border);border-radius:5px;padding:5px 7px;background:var(--surface);color:var(--text);cursor:pointer}
#ext-tile-grid button:hover:not(:disabled){background:var(--hover-bg)}
#ext-tile-grid button:disabled{cursor:default;opacity:.6}
#ext-tile-grid button:focus-visible,.ext-tiling-launch:focus-visible{outline:none;box-shadow:0 0 0 3px var(--focus-ring,var(--accent))}
.ext-tile-body{flex:1;min-height:0;overflow:auto;padding:8px;font-family:var(--font-conversation,var(--font-ui))}
.ext-tile-msg-inner{display:flex;flex-direction:column}
.ext-tile-msg-inner .msg-row{min-width:0}.ext-tile-msg-inner .msg-body{min-width:0}.ext-tile-msg-inner pre{max-width:100%;overflow:auto}
.ext-tile-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;min-height:120px;text-align:center;color:var(--muted);font-size:13px;padding:12px}
.ext-tile-empty p{margin:0;max-width:28ch}
.ext-tile-footer{display:flex;align-items:center;gap:6px;padding:5px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
.ext-tile-footer span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ext-tiling-cells.ext-tiling-expanded{grid-template-columns:minmax(0,1fr)!important;grid-auto-rows:minmax(0,1fr)}
.ext-tiling-sidebar-hint{margin:0 12px 8px;padding:8px 10px;border:1px solid var(--accent-bg-strong,var(--border));border-radius:8px;background:var(--accent-bg,var(--surface));color:var(--accent-text,var(--text));font-size:12px;line-height:1.4}
.sidebar.ext-tiling-picking #sessionList .session-item[data-sid]{cursor:copy}
@container (max-width:900px){.ext-tiling-cells.ext-cols-3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container (max-width:620px){.ext-tiling-cells,.ext-tiling-cells.ext-cols-3{grid-template-columns:minmax(0,1fr)}.ext-tiling-cells{grid-auto-rows:minmax(260px,420px)}.ext-tiling-cells.ext-tiling-expanded{grid-auto-rows:minmax(260px,1fr)}.ext-tiling-controls>span{flex-basis:100%}}
@media(max-width:640px){#ext-tiling-toolbar{position:static;height:auto;margin:0}.ext-tiling-launch{width:44px;height:44px}#ext-tile-grid button,#ext-tile-grid .ext-tiling-layout button{min-height:44px;min-width:44px}
.app-titlebar:has(#ext-tiling-toolbar:not([hidden])) .app-titlebar-spacer{display:none}}
@media(hover:none){.ext-tiling-launch.has-tooltip::after{display:none}}
@media(prefers-reduced-motion:reduce){.ext-tiling-launch{transition:none}}
`;document.head.append(style);
    const toolbar=document.createElement('div');toolbar.id='ext-tiling-toolbar';
    launcher=button('',()=>T.visible?hideGrid():showGrid(T.cols,T.rows));
    launcher.className='ext-tiling-launch has-tooltip has-tooltip--bottom-right';launcher.innerHTML=ICON_COMPARE;
    launcher.setAttribute('aria-label','Compare history');launcher.dataset.tooltip='Compare history';
    launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-controls','ext-tile-grid');toolbar.append(launcher);
    // In-flow on phones (before Core's new-chat/reload buttons); absolutely
    // positioned on wider screens so Core's centered title is unaffected.
    const before=document.getElementById('btnTitlebarNewChat');
    if(before&&before.parentNode===titlebar)titlebar.insertBefore(toolbar,before);else titlebar.append(toolbar);
    grid=document.createElement('div');grid.id='ext-tile-grid';grid.hidden=true;grid.setAttribute('role','region');grid.setAttribute('aria-label','Conversation history snapshots');
    grid.addEventListener('keydown',e=>{blockActivation(e);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hideGrid();}});
    const controls=document.createElement('div');controls.className='ext-tiling-controls';
    status=document.createElement('span');status.setAttribute('role','status');
    layoutGroup=document.createElement('div');layoutGroup.className='ext-tiling-layout';layoutGroup.setAttribute('role','group');layoutGroup.setAttribute('aria-label','Snapshots per grid');
    [2,4,6].forEach(n=>{const b=button(String(n),()=>showGrid(...layouts[n]));b.dataset.count=String(n);b.setAttribute('aria-label',n+' snapshots');b.setAttribute('aria-pressed','false');layoutGroup.append(b);});
    controls.append(status,layoutGroup,button('Return to chat',()=>hideGrid()));cells=document.createElement('div');cells.className='ext-tiling-cells';grid.append(controls,cells);shell.append(grid);
    ['pointerdown','pointerup','touchstart','touchend','click','dblclick','keydown'].forEach(type=>document.addEventListener(type,sidebarSnapshot,{capture:true,passive:false}));
    if(typeof window.registerHermesSessionOpenHandler==='function')window.registerHermesSessionOpenHandler((_sid,_data,opts)=>{if(opts?.preload&&T.visible)hideGrid(false);return {};});
    const main=document.querySelector('main');if(main){panelObserver=new MutationObserver(()=>{const chat=isChatView();toolbar.hidden=!chat;if(!chat)hideGrid(false);});panelObserver.observe(main,{attributes:true,attributeFilter:['class']});}
    window.chatTilingState=T;window.showGridExt=showGrid;window.hideGridExt=hideGrid;window.closeTileExt=closeTile;window.focusTileExt=openTile;window.addTilingSnapshot=addSnapshot;window.refreshTilingSnapshot=id=>{const t=T.tiles.find(t=>t.id===id);return t?refreshTile(t):Promise.resolve();};window.toggleMaxExt=toggleMax;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
