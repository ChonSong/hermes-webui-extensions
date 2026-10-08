// Chat Tiling v1: saved-history snapshots only. Core owns the sole composer,
// navigation, approvals, sends and streams. No focus/rollback transaction.
(function(){
  'use strict';
  const T={tiles:[],visible:false,cols:2,rows:1,nextId:1,epoch:0,maximizedId:null,opening:false};
  let grid=null,cells=null,status=null,layout=null,launcher=null,panelObserver=null,sidTimer=null;
  let savedNodes=[],returnFocus=null,observedSid=null;
  const sidebarPresses=new WeakMap();
  const layouts={2:[2,1],4:[2,2],6:[3,2]};
  function currentSid(){
    try{return typeof S!=='undefined'?S.session?.session_id||null:null;}catch(_){return null;}
  }
  function notice(text){if(status)status.textContent=text;}
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
  function makeTile(){
    const t={id:T.nextId++,sid:null,title:'Empty snapshot',messages:[],generation:0,loading:false,error:null,el:null};
    const el=document.createElement('section');el.className='ext-tile';el.dataset.tileId=String(t.id);
    const head=document.createElement('div');head.className='ext-tile-titlebar';
    const open=button('Empty snapshot',()=>openTile(t.id));open.className='ext-tile-open';open.disabled=true;
    head.append(open,button('Expand',()=>toggleMax(t.id)),button('Close',()=>closeTile(t.id)));
    head.lastChild.setAttribute('aria-label','Close snapshot');
    head.children[1].setAttribute('aria-label','Expand snapshot');
    const body=document.createElement('div');body.className='ext-tile-body';
    const inner=document.createElement('div');inner.className='ext-tile-msg-inner';body.append(inner);
    const footer=document.createElement('div');footer.className='ext-tile-footer';
    footer.append(button('Refresh history',()=>refreshTile(t)),document.createElement('span'));
    el.append(head,body,footer);t.el=el;T.tiles.push(t);return t;
  }
  function paint(t){
    const open=t.el.querySelector('.ext-tile-open');open.textContent=t.title;
    open.disabled=!t.sid||t.loading;open.setAttribute('aria-label',t.sid?'Open '+t.title+' in normal chat':'Empty snapshot');
    t.el.querySelector('.ext-tile-footer button').disabled=!t.sid||t.loading;
    const label=t.el.querySelector('.ext-tile-footer span');
    label.textContent=t.loading?'Loading history…':t.error?'Refresh failed; showing saved snapshot':t.sid?'Saved history · open to chat':'Choose a sidebar conversation';
    const inner=t.el.querySelector('.ext-tile-msg-inner');
    if(t.sid&&t.messages.length)window.renderTranscript(inner,t.messages,{skipEmpty:false});
    else{inner.textContent=t.loading?'Loading history…':t.error?'History unavailable. Try Refresh history.':t.sid?'No saved messages yet.':'Choose a sidebar conversation to compare.';}
  }
  function render(){
    if(!cells)return;
    cells.replaceChildren(...T.tiles.map(t=>t.el));
    cells.style.gridTemplateColumns=`repeat(${T.cols},minmax(0,1fr))`;
    cells.style.gridTemplateRows=`repeat(${T.rows},minmax(0,1fr))`;
    cells.classList.toggle('ext-tiling-expanded',T.maximizedId!==null);
    T.tiles.forEach(t=>{
      t.el.hidden=T.maximizedId!==null&&t.id!==T.maximizedId;
      t.el.querySelector('.ext-tile-titlebar button:nth-child(2)').textContent=T.maximizedId===t.id?'Restore':'Expand';
      paint(t);
    });
    if(layout)layout.value=String(T.cols*T.rows);
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
    if(!t){notice('Close a snapshot or choose a larger layout to add another.');return false;}
    t.sid=sid;t.title='Conversation history';render();await refreshTile(t);return true;
  }
  function closeTile(id){
    const t=T.tiles.find(t=>t.id===id);if(!t)return;
    ++t.generation;T.tiles=T.tiles.filter(x=>x!==t);
    if(T.maximizedId===id)T.maximizedId=null;
    if(!T.tiles.length){hideGrid();return;}
    render();T.tiles[0].el.querySelector('.ext-tile-titlebar button:last-child').focus();
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
  function hideGrid(focus=true){
    if(!T.visible)return;
    T.visible=false;++T.epoch;T.tiles.forEach(t=>{++t.generation;t.loading=false;});
    grid.hidden=true;document.getElementById('mainChat')?.classList.remove('ext-tiling-browsing');
    restoreAccessibility();launcher.setAttribute('aria-expanded','false');
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
    if(T.tiles.filter(t=>t.sid).length>count){notice('Close snapshots before reducing the layout.');if(layout)layout.value=String(T.cols*T.rows);return;}
    T.cols=cols;T.rows=rows;
    while(T.tiles.length>count){const t=T.tiles.find(t=>!t.sid);if(!t)break;++t.generation;T.tiles.splice(T.tiles.indexOf(t),1);}
    while(T.tiles.length<count)makeTile();
    if(!T.visible){
      T.visible=true;++T.epoch;returnFocus=document.activeElement;saveAccessibility();
      document.getElementById('mainChat')?.classList.add('ext-tiling-browsing');grid.hidden=false;
      launcher.setAttribute('aria-expanded','true');observedSid=currentSid();
      sidTimer=setInterval(()=>{const sid=currentSid();if(sid!==observedSid){hideGrid(false);}},300);
    }
    render();notice('History snapshots · choose sidebar conversations to compare.');
    // Reopening retains cached snapshots; refresh is explicit. No Core load.
    if(!T.tiles.some(t=>t.sid)){const sid=currentSid();if(sid)await addSnapshot(sid);}
    if(T.visible)T.tiles[0]?.el.querySelector('.ext-tile-open')?.focus();
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
    if(e.type!=='dblclick')addSnapshot(row.dataset.sid);
  }
  function init(){
    const shell=document.querySelector('.messages-shell'),mainChat=document.getElementById('mainChat'),titlebar=document.querySelector('.app-titlebar');
    if(!shell||!mainChat||!titlebar||typeof window.renderTranscript!=='function'||typeof window.loadSession!=='function'||typeof window.registerHermesSessionOpenHandler!=='function')return;
    const style=document.createElement('style');style.id='ext-tiling-css';style.textContent=`
#ext-tiling-toolbar{margin-left:auto;flex-shrink:0;-webkit-app-region:no-drag}
#ext-tiling-toolbar button{-webkit-app-region:no-drag;font:inherit;font-size:12px;padding:5px 8px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:6px}
#mainChat.ext-tiling-browsing #messages{visibility:hidden}
#mainChat.ext-tiling-browsing #composerWrap{display:none!important}
#ext-tile-grid[hidden],.ext-tile[hidden]{display:none!important}
#ext-tile-grid{position:absolute;inset:0;z-index:10;background:var(--bg);display:flex;flex-direction:column;padding:8px;gap:8px;overflow:hidden;color:var(--text)}
.ext-tiling-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;flex-shrink:0}
.ext-tiling-controls span{flex:1;min-width:120px;color:var(--text-muted)}
.ext-tiling-cells{display:grid;gap:8px;flex:1;min-height:0;overflow:auto}
.ext-tile{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg)}
.ext-tile-titlebar{display:flex;gap:4px;align-items:center;background:var(--surface);padding:6px;border-bottom:1px solid var(--border)}
.ext-tile-open{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-weight:600}
#ext-tile-grid button,#ext-tile-grid select{font:inherit;font-size:12px;border:1px solid var(--border);border-radius:5px;padding:5px 7px;background:var(--surface);color:var(--text);cursor:pointer}
#ext-tile-grid .ext-tiling-controls select{width:auto;max-width:100%;flex-shrink:0}
#ext-tile-grid button:disabled{cursor:default;opacity:.6}
#ext-tile-grid button:focus-visible,#ext-tiling-toolbar button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ext-tile-body{flex:1;min-height:0;overflow:auto;padding:8px;font-family:var(--font-conversation,var(--font-ui))}
.ext-tile-msg-inner .msg{max-width:100%;min-width:0}.ext-tile-msg-inner pre{max-width:100%;overflow:auto}
.ext-tile-footer{display:flex;align-items:center;gap:6px;padding:5px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted)}
.ext-tiling-cells.ext-tiling-expanded{grid-template-columns:1fr!important;grid-template-rows:1fr!important}
@media(max-width:700px){.ext-tiling-cells{grid-template-columns:1fr!important;grid-template-rows:none!important;grid-auto-rows:minmax(260px,420px)}.ext-tiling-controls span{flex-basis:100%}.ext-tiling-cells.ext-tiling-expanded{grid-auto-rows:minmax(260px,1fr)}}
`;document.head.append(style);
    const toolbar=document.createElement('div');toolbar.id='ext-tiling-toolbar';
    launcher=button('Compare history',()=>T.visible?hideGrid():showGrid(T.cols,T.rows));launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-controls','ext-tile-grid');toolbar.append(launcher);titlebar.append(toolbar);
    grid=document.createElement('div');grid.id='ext-tile-grid';grid.hidden=true;grid.setAttribute('role','region');grid.setAttribute('aria-label','Conversation history snapshots');
    grid.addEventListener('keydown',e=>{blockActivation(e);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hideGrid();}});
    const controls=document.createElement('div');controls.className='ext-tiling-controls';
    status=document.createElement('span');status.setAttribute('role','status');
    layout=document.createElement('select');layout.setAttribute('aria-label','History grid layout');
    [2,4,6].forEach(n=>{const option=document.createElement('option');option.value=String(n);option.textContent=n+' snapshots';layout.append(option);});
    layout.addEventListener('change',()=>showGrid(...layouts[Number(layout.value)]));
    controls.append(status,layout,button('Return to chat',()=>hideGrid()));cells=document.createElement('div');cells.className='ext-tiling-cells';grid.append(controls,cells);shell.append(grid);
    ['pointerdown','pointerup','touchstart','touchend','click','dblclick','keydown'].forEach(type=>document.addEventListener(type,sidebarSnapshot,{capture:true,passive:false}));
    if(typeof window.registerHermesSessionOpenHandler==='function')window.registerHermesSessionOpenHandler((_sid,_data,opts)=>{if(opts?.preload&&T.visible)hideGrid(false);return {};});
    const main=document.querySelector('main');if(main){panelObserver=new MutationObserver(()=>{const chat=isChatView();toolbar.hidden=!chat;if(!chat)hideGrid(false);});panelObserver.observe(main,{attributes:true,attributeFilter:['class']});}
    window.chatTilingState=T;window.showGridExt=showGrid;window.hideGridExt=hideGrid;window.closeTileExt=closeTile;window.focusTileExt=openTile;window.addTilingSnapshot=addSnapshot;window.refreshTilingSnapshot=id=>{const t=T.tiles.find(t=>t.id===id);return t?refreshTile(t):Promise.resolve();};window.toggleMaxExt=toggleMax;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
