"""Real-Core regression probe; delayed/rejected wrapper preserves real loadSession.

No fork test harness, raw-GitHub download, eval, model or cancellation calls.
The cancellation producer and fitted-pane product contract are outside this probe.
"""
import importlib.util
import json
import sys
import os
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
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
        approval_requests=[]
        fault_requests=[]
        def block_approval(route):
            # Synthetic cards only. No approval response reaches the backend,
            # including the positive control proving the trap is observable.
            approval_requests.append(route.request.post_data_json)
            route.fulfill(status=409,json={'error':'Synthetic approval trap; no authorization performed'})
        def open_context():
            context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
            events=smoke._install_network_guards(context)
            context.route('**/api/approval/respond',block_approval)
            return context,events
        ctx,network_events=open_context()
        sids=[]
        for name in ['A','B']:
            d=ctx.request.post(url+'/api/session/import',data={'title':'Regression '+name,'messages':[{'role':'user','content':'Question '+name},{'role':'assistant','content':'Body '+name+'\n\n'+('Long content for real native rendering. '*30)+'\n\n```js\nconst x = 1;\n```'}]}).json()
            assert d.get('ok'),d
            sids.append(d['session']['session_id'])
        page=ctx.new_page()
        page_errors=[]
        page.on('pageerror',lambda error:page_errors.append(str(error)))
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
            global ctx,page,network_events
            smoke._assert_browser_health(case_name='tiling transactions',console_errors=[],page_errors=page_errors,
                extension_fragments=('chat-tiling',),network_events=network_events)
            ctx.close()
            ctx,network_events=open_context()
            page=ctx.new_page()
            page_errors.clear()
            page.on('pageerror',lambda error:page_errors.append(str(error)))
            page.goto(url)
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
        # Core catches HTTP metadata failures and resolves loadSession after
        # clearing the old transcript. Exercise the real producer, not a
        # Promise.reject replacement. Both focus and active-close must restore A.
        def fail_metadata(route):
            query=parse_qs(urlsplit(route.request.url).query)
            if query.get('session_id')==[sids[1]] and query.get('messages')==['0']:
                fault_requests.append(route.request.url)
                route.fulfill(status=503,json={'error':'Controlled metadata failure'})
            else:
                route.fallback()
        for action in ['focus','close']:
            fresh()
            ctx.route('**/api/session?*',fail_metadata)
            requests_before=len(fault_requests)
            page.evaluate("""async action=>{const b=chatTilingState.tiles.find(t=>t.sid===reviewSids[1]);
              if(action==='focus')await focusTileExt(b.id);else await closeTileExt(chatTilingState.activeId);
            }""",action)
            r=page.evaluate(owner)
            results.append({'case':f'real metadata failure during {action} restores original transcript',
                'pass':len(fault_requests)>requests_before and r['count']==2 and r['core']==sids[0]
                    and r.get('tile')==sids[0] and r['draft']=='draft-A' and 'Body A' in r['body'], 'state':r})
        # Use Core's actual approval card and document shortcut with a fake ID.
        # The route trap above is installed before any page is navigated.
        def synthetic_approval():
            page.evaluate("""()=>{stopApprovalPolling();showApprovalForSession(S.session.session_id,
              {approval_id:'synthetic-tiling-only',tool_name:'synthetic',description:'No backend approval exists'},1);}""")
            page.wait_for_timeout(100)
            assert page.locator('#approvalCard').evaluate("e=>e.classList.contains('visible')")
        fresh()
        synthetic_approval()
        before=len(approval_requests)
        page.locator('.app-titlebar-title').evaluate("e=>{e.tabIndex=0;e.focus()}")
        page.keyboard.press('Enter')
        page.wait_for_timeout(250)
        results.append({'case':'approval trap observes and blocks Core shortcut positive control',
            'pass':len(approval_requests)==before+1,'blockedRequests':len(approval_requests)-before})
        selectors=['.ext-tile-title', '.ext-tile-close-btn', '.ext-tile-maximize-btn',
            '#ext-tiling-toolbar [data-layout="4"]','#ext-tiling-toolbar [data-layout="close"]']
        for selector in selectors:
            for key in ['Enter','Space']:
                fresh()
                synthetic_approval()
                before=len(approval_requests)
                if selector=='.ext-tile-title':
                    target=page.locator('.ext-tile').nth(1)
                else:
                    target=page.locator(selector).first
                target.focus()
                target.press(key)
                page.wait_for_timeout(250)
                results.append({'case':f'{selector} {key} cannot approve a tool call',
                    'pass':len(approval_requests)==before,'approvalRequests':len(approval_requests)-before})
        smoke._assert_browser_health(case_name='tiling final',console_errors=[],page_errors=page_errors,
            extension_fragments=('chat-tiling',),network_events=network_events)
        # Negative checks for both transport guards. These controlled probes
        # happen after normal-operation egress assertions and must stay blocked.
        # A blank page avoids Core's CSP rejecting the HTTP probe before the
        # shared route can observe it. This remains the guarded context.
        guard_page=ctx.new_page()
        guard_page.evaluate("""async()=>{await fetch('https://example.invalid/tiling-guard-probe').catch(()=>{});
          window.guardProbeSocket=new WebSocket('wss://example.invalid/tiling-guard-probe');}""")
        guard_page.wait_for_timeout(150)
        results.append({'case':'shared HTTP and WebSocket guards block deliberate off-origin probes',
            'pass':len(network_events['unexpected_http'])==1 and len(network_events['unexpected_websockets'])==1,
            'networkEvents':network_events})
        (out/'results.json').write_text(json.dumps(results,indent=2))
        print(json.dumps([{k:v for k,v in r.items() if k not in ['state']} for r in results],indent=2))
        browser.close()
finally:
    smoke._terminate(proc,log)
sys.exit(0 if all(r['pass'] for r in results) else 1)
