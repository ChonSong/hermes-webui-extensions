#!/usr/bin/env python3
"""Record demo video of external-app-tab Spec #4: Icon Picker."""
import json
import time
from playwright.sync_api import sync_playwright

DEV_URL = "http://127.0.0.1:8788"
OUT_DIR = "/home/sc/workspace/hermes-webui-extensions/proofshot/demo-spec4"

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        viewport={"width": 1280, "height": 800},
        record_video_dir=OUT_DIR,
        record_video_size={"width": 1280, "height": 800},
    )
    page = context.new_page()
    page.goto(DEV_URL, wait_until="networkidle")
    page.wait_for_timeout(800)

    # Seed localStorage
    page.evaluate("""() => {
        localStorage.setItem("hermes-ext-external-app", JSON.stringify({
            _v:2, apps:[
                {id:"g1", url:"https://grafana.example.com", label:"Grafana", icon:"globe"},
                {id:"v1", url:"https://vaultwarden.example.com", label:"Vaultwarden", icon:"lock"},
            ]
        }));
        location.reload();
    }""")
    page.wait_for_timeout(1500)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    # 1. Open Grafana overlay
    page.click('[data-hwx-extapp="1"]:first-child')
    page.wait_for_timeout(600)

    # 2. Open config dialog
    page.click(".hwx-extapp-config")
    page.wait_for_timeout(400)

    # 3. Click "Choose" icon button
    page.click(".hwx-extapp-icon-choose")
    page.wait_for_timeout(600)

    # 4. Type "cli" in search filter
    inp = page.locator(".hwx-extapp-picker-search")
    inp.click()
    page.fill(".hwx-extapp-picker-search", "cli")
    page.wait_for_timeout(400)

    # 5. Clear search, pick "bell" icon
    inp.fill("")
    page.wait_for_timeout(200)
    page.click('.hwx-extapp-picker-cell[title="bell"]')
    page.wait_for_timeout(400)

    # 6. Save config
    page.click(".hwx-extapp-save")
    page.wait_for_timeout(800)

    # 7. Open config for Vaultwarden to show its icon field
    page.click(".hwx-extapp-config")
    page.wait_for_timeout(400)

    # 8. Open icon picker to show search feature  
    page.click(".hwx-extapp-icon-choose")
    page.wait_for_timeout(400)
    inp2 = page.locator(".hwx-extapp-picker-search")
    inp2.click()
    page.fill(".hwx-extapp-picker-search", "compass")
    page.wait_for_timeout(300)

    # 9. Close picker, close config
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # 10. Close overlay
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    browser.close()

print("Spec #4 demo recorded in", OUT_DIR)
