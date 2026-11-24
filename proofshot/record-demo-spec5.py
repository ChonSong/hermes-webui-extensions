#!/usr/bin/env python3
"""Record proofshot video for Spec #5 CSS System — manager view + button variants."""
import json, time, glob, os, sys
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/sc/workspace/hermes-webui-extensions/proofshot/demo-spec5"
os.makedirs(OUT_DIR, exist_ok=True)

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

    # Seed 3 apps + reload
    page.evaluate("""() => {
        localStorage.setItem("hermes-ext-external-app", JSON.stringify({
            _v:2, apps:[
                {id:"g1", url:"https://grafana.example.com", label:"Grafana", icon:"globe"},
                {id:"v1", url:"https://vaultwarden.example.com", label:"Vaultwarden", icon:"lock"},
                {id:"p1", url:"https://prometheus.example.com", label:"Prometheus", icon:"activity"}
            ]
        }));
    }""")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    cnt = page.evaluate("document.querySelectorAll('[data-hwx-extapp=\"1\"]').length")
    print(f"Rail buttons: {cnt}")

    # 1 — Open overlay (shows styled bar buttons: Manage, Add, Configure, Open, Close)
    page.click("#hwxExtAppRailBtn-g1")
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT_DIR}/step-1-overlay.png")
    print("1/5 Captured overlay bar with button variants")

    # 2 — Manager view (styled rows, order badges, labels, URL truncation)
    page.evaluate("document.querySelector('.hwx-extapp-manage')?.click()")
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT_DIR}/step-2-manager.png")
    print("2/5 Captured manager view with styled rows")

    # 3 — Config dialog with button variants
    page.evaluate("document.querySelector('.hwx-extapp-config')?.click()")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT_DIR}/step-3-config-primary-save.png")
    print("3/5 Captured config dialog with Save=primary, Cancel=ghost, Delete=danger")

    # 4 — Delete button hover state (danger style)
    del_btn = page.query_selector(".hwx-extapp-btn-danger")
    if del_btn:
        del_btn.hover()
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT_DIR}/step-4-delete-hover.png")
        print("4/5 Captured delete button hover (danger variant)")

    # 5 — Icon chooser
    page.evaluate("document.querySelector('.hwx-extapp-icon-choose')?.click()")
    page.wait_for_timeout(500)
    page.fill(".hwx-extapp-picker-search", "bell")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT_DIR}/step-5-icon-picker.png")
    print("5/5 Captured icon picker (unchanged, regression check)")

    context.close()
    browser.close()

    # Find the video
    files = sorted(glob.glob(OUT_DIR + "/page*.webm"), key=os.path.getmtime)
    print(f"Video: {files}")
