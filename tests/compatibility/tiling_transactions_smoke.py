"""Real-Core regression probe; delayed/rejected wrapper preserves real loadSession.

No fork test harness, raw-GitHub download, eval, model or cancellation calls.
The cancellation producer and fitted-pane product contract are outside this probe.
"""
import importlib.util
import json
import sys
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
CORE=Path(os.environ["HERMES_CORE_DIR"]).resolve()
spec=importlib.util.spec_from_file_location('smoke',ROOT/'tests/compatibility/browser_smoke.py')
smoke=importlib.util.module_from_spec(spec)
sys.modules['smoke']=smoke
spec.loader.exec_module(smoke)
extension_root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'extensions'
out=Path(os.environ.get('COMPATIBILITY_EVIDENCE_DIR','compatibility-evidence'))/'tiling-transactions'
out.mkdir(parents=True,exist_ok=True)
proc,log,url,port=smoke._start_server(core_dir=CORE,extension_root=extension_root,manifest_relative='chat-tiling/manifest.json',state_root=out/'state',log_path=out/'server.log',requested_port=0)
results=[]
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('HERMES_REVIEW_BROWSER_EXECUTABLE'))
        ctx=browser.new_context(viewport={'width':1440,'height':1000})
        ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(url) else r.abort())
        sids=[]
        for name in ['A','B']:
            d=ctx.request.post(url+'/api/session/import',data={'title':'Regression '+name,'messages':[{'role':'user','content':'Question '+name},{'role':'assistant','content':'Body '+name+'\n\n'+('Long content for real native rendering. '*30)+'\n\n```js\nconst x = 1;\n```'}]}).json()
            assert d.get('ok'),d
            sids.append(d['session']['session_id'])
        page=ctx.new_page()
        page.goto(url)
        page.wait_for_selector('#ext-tiling-toolbar')
        page.wait_for_timeout(1000)
        page.evaluate('sids=>window.reviewSids=sids',sids)
        setup="""async () => {
          await hideGridExt(); await loadSession(reviewSids[0]);
          document.querySelector('#msg').value='draft-A';
          await showGridExt(2,1); await loadSession(reviewSids[1]);
          document.querySelector('#msg').value='draft-B';
          const a=chatTilingState.tiles.find(t=>t.sid===reviewSids[0]);
          if(!a)throw new Error('Setup tiles '+JSON.stringify(chatTilingState.tiles.map(t=>({sid:t.sid,id:t.id})))+' Core '+S.session?.session_id);
          await focusTileExt(a.id); window.realReviewLoad=window.loadSession;
        }"""
        owner="""() => {const t=chatTilingState.tiles.find(t=>t.id===chatTilingState.activeId);return {core:S.session?.session_id,tile:t?.sid,draft:document.querySelector('#msg').value,body:document.querySelector('#msgInner').textContent,visible:chatTilingState.visible,grid:!!document.querySelector('#ext-tile-grid'),count:chatTilingState.tiles.length};}"""
        def fresh():
            page.reload()
            page.wait_for_selector('#ext-tiling-toolbar')
            page.wait_for_timeout(1000)
            page.evaluate('sids=>window.reviewSids=sids',sids)
            page.evaluate(setup)
        for cols,rows in [(2,2),(1,2)]:
            fresh()
            page.evaluate("""([cols,rows]) => {
              window.loadSession=async (...args)=>{await new Promise(r=>window.releaseReviewLoad=r);return realReviewLoad(...args)};
              const b=chatTilingState.tiles.find(t=>t.sid===reviewSids[1]);
              window.reviewFocus=focusTileExt(b.id);
              window.reviewLayout=showGridExt(cols,rows);
            }""",[cols,rows])
            page.wait_for_function('typeof releaseReviewLoad === "function"')
            page.evaluate('releaseReviewLoad()')
            page.evaluate('async()=>{await Promise.all([reviewFocus,reviewLayout]);window.loadSession=realReviewLoad;}')
            r=page.evaluate(owner)
            ok=r['core']==sids[1] and r.get('tile')==sids[1] and r['draft']=='draft-B' and 'Body B' in r['body']
            results.append({'case':f'focus then layout {cols}x{rows}','pass':ok,'state':r})
        fresh()
        page.evaluate('async()=>await Promise.all([hideGridExt(),hideGridExt()])')
        r=page.evaluate(owner)
        results.append({'case':'double hide tears down state and DOM','pass':not r['visible'] and not r['grid'] and r['count']==0,'state':r})
        fresh()
        page.evaluate('async()=>await Promise.all([hideGridExt(),showGridExt(2,2)])')
        r=page.evaluate(owner)
        results.append({'case':'hide then layout reopens consistently','pass':r['visible'] and r['grid'] and r['count']==4 and r.get('tile')==r['core'],'state':r})
        fresh()
        page.evaluate("""async()=>{window.loadSession=(sid,...args)=>sid===reviewSids[1]?Promise.reject(new Error('controlled load failure')):realReviewLoad(sid,...args);await closeTileExt(chatTilingState.activeId);window.loadSession=realReviewLoad;}""")
        r=page.evaluate(owner)
        results.append({'case':'failed successor preserves owner tile and draft','pass':r['count']==2 and r['core']==sids[0] and r.get('tile')==sids[0] and r['draft']=='draft-A','state':r})
        fresh()
        page.evaluate('async()=>await closeTileExt(chatTilingState.activeId)')
        r=page.evaluate(owner)
        results.append({'case':'successful successor before removal','pass':r['count']==1 and r['core']==sids[1] and r.get('tile')==sids[1] and r['draft']=='draft-B','state':r})
        page.evaluate('async()=>await closeTileExt(chatTilingState.activeId)')
        r=page.evaluate(owner)
        results.append({'case':'last bound close returns ordinary Core','pass':not r['visible'] and not r['grid'] and r['core']==sids[1] and r['draft']=='draft-B','state':r})
        fresh()
        b=page.locator('.ext-tile').filter(has=page.locator('.ext-tile-title',has_text='Regression B'))
        b.focus()
        b.press('Enter')
        page.wait_for_timeout(500)
        r=page.evaluate(owner)
        results.append({'case':'keyboard activates bound tile','pass':r['core']==sids[1] and r.get('tile')==sids[1],'state':r})
        labels=page.locator('.ext-tile').evaluate_all('(els)=>els.map(e=>({label:e.getAttribute("aria-label"),current:e.getAttribute("aria-current"),tab:e.tabIndex}))')
        results.append({'case':'accurate keyboard state labels','pass':sum(l['current']=='true' for l in labels)==1 and all(l['tab']==0 for l in labels),'labels':labels})
        page.screenshot(path=str(out/'populated-desktop.png'))
        b.locator('.ext-tile-close-btn').focus()
        b.locator('.ext-tile-close-btn').press('Enter')
        page.wait_for_timeout(500)
        r=page.evaluate(owner)
        recovered=page.evaluate('()=>document.activeElement===chatTilingState.tiles.find(t=>t.id===chatTilingState.activeId)?.el')
        results.append({'case':'keyboard close recovers focus to live successor','pass':recovered and r['core']==sids[0] and r.get('tile')==sids[0],'state':r})
        (out/'results.json').write_text(json.dumps(results,indent=2))
        print(json.dumps([{k:v for k,v in r.items() if k not in ['state']} for r in results],indent=2))
        browser.close()
finally:
    smoke._terminate(proc,log)
sys.exit(0 if all(r['pass'] for r in results) else 1)
