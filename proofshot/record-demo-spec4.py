#!/usr/bin/env python3
"""Record proofshot video for Spec #4 Icon Picker."""
import json, time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/sc/workspace/hermes-webui-extensions/proofshot/demo-spec4"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1280, "height": 800},
        record_video_dir=OUT_DIR,
        record_video_size={"width": 1280, "height": 800},
    )
    page = context.new_page()

    print("Loading page...")
    page.goto("http://127.0.0.1:8788/", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2000)

    # Seed localStorage + reload
    page.evaluate("""() => {
        localStorage.setItem("hermes-ext-external-app", JSON.stringify({
            _v:2, apps:[
                {id:"g1", url:"https://grafana.example.com", label:"Grafana", icon:"globe"},
                {id:"v1", url:"https://vaultwarden.example.com", label:"Vaultwarden", icon:"lock"}
            ]
        }));
    }""")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    cnt = page.evaluate("document.querySelectorAll('[data-hwx-extapp=\"1\"]').length")
    print(f"Rail buttons: {cnt}")

    # 1 - Click Grafana rail
    page.click("#hwxExtAppRailBtn-g1")
    page.wait_for_timeout(800)

    # 2 - Config dialog
    page.evaluate("document.querySelector('.hwx-extapp-config')?.click()")
    page.wait_for_timeout(500)

    # 3 - Icon picker
    page.evaluate("document.querySelector('.hwx-extapp-icon-choose')?.click()")
    page.wait_for_timeout(700)

    # 4 - Type "cli" filter
    page.fill(".hwx-extapp-picker-search", "cli")
    page.wait_for_timeout(600)

    # 5 - Clear, pick "bell"
    page.fill(".hwx-extapp-picker-search", "")
    page.wait_for_timeout(300)
    page.evaluate("document.querySelector('.hwx-extapp-picker-cell[title=\"bell\"]')?.click()")
    page.wait_for_timeout(500)

    # 6 - Save
    page.evaluate("document.querySelector('.hwx-extapp-save')?.click()")
    page.wait_for_timeout(1000)

    # 7 - Vaultwarden config + picker + search "compass"
    page.evaluate("document.querySelector('.hwx-extapp-config')?.click()")
    page.wait_for_timeout(500)
    page.evaluate("document.querySelector('.hwx-extapp-icon-choose')?.click()")
    page.wait_for_timeout(500)
    page.fill(".hwx-extapp-picker-search", "compass")
    page.wait_for_timeout(500)

    # 8 - Close
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(800)

    # Properly close context to finalize video
    context.close()
    browser.close()

    # Find the video
    import glob, os
    files = sorted(glob.glob(OUT_DIR + "/page*.webm"), key=os.path.getmtime)
    print(f"Videos: {files}")
