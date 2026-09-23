#!/usr/bin/env python3
"""Record demo video of external-app-tab Spec #3: App Manager."""
import json
import time
from playwright.sync_api import sync_playwright

DEV_URL = "http://127.0.0.1:8788"
VIDEO_PATH = "/home/sc/workspace/hermes-webui-extensions/proofshot/demo-spec3"
DATA = {"_v":2,"apps":[
  {"id":"g1","url":"https://grafana.example.com","label":"Grafana","icon":""},
  {"id":"v1","url":"https://vault.warden.example.com","label":"Vaultwarden","icon":""},
  {"id":"j1","url":"https://jellyfin.example.com","label":"Jellyfin","icon":""},
]}

def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context(
            record_video_dir=VIDEO_PATH,
            record_video_size={"width":1280,"height":800},
        )
        page = context.new_page()
        page.goto(DEV_URL)
        page.evaluate("localStorage.setItem('hermes-ext-external-app','"+json.dumps(DATA).replace("'","\\'")+"')")
        page.reload()
        page.wait_for_timeout(2000)
        print("[1] Loaded with 3 apps")

        # 2. Click Grafana rail → open overlay
        grafana_btn = page.query_selector('[aria-label="Grafana"]')
        assert grafana_btn, "Grafana btn not found"
        grafana_btn.click()
        page.wait_for_timeout(1000)
        print("[2] Grafana overlay open")

        # 3. Click Manage button
        page.click(".hwx-extapp-manage")
        page.wait_for_timeout(800)
        print("[3] Manager view open")

        # 4. Move Vaultwarden up twice
        # First up: row[1] Vaultwarden
        up_btns = page.query_selector_all(".hwx-extapp-mgr-up")
        up_btns[0].click()  # Vaultwarden ↑ (row 1)
        page.wait_for_timeout(400)
        up_btns = page.query_selector_all(".hwx-extapp-mgr-up")
        up_btns[0].click()  # Vaultwarden ↑ (now row 0 from row 1)
        page.wait_for_timeout(400)
        print("[4] Vaultwarden moved to top")

        # 5. Open Jellyfin from manager
        open_btns = page.query_selector_all(".hwx-extapp-mgr-row .hwx-extapp-mgr-actions button")
        open_btns[4].click()  # Row 2 (Jellyfin) → Open button
        page.wait_for_timeout(1000)
        print("[5] Opened Jellyfin from manager")

        # 6. Re-open manager and delete Grafana
        page.click(".hwx-extapp-manage")
        page.wait_for_timeout(800)
        del_btns = page.query_selector_all(".hwx-extapp-mgr-del")
        del_btns[0].click()  # Delete Grafana (row 1 after Vaultwarden move)
        page.wait_for_timeout(500)
        print("[6] Grafana deleted from manager")

        # Close
        context.close()
        browser.close()

if __name__ == "__main__":
    run()
