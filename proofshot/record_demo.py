#!/usr/bin/env python3
"""Record a demo video of the open-in-workspace file chips feature."""
import time
from playwright.sync_api import sync_playwright

DEV_URL = "http://127.0.0.1:8788"
SESSION_ID = "8d8ad589e0d9"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir="/home/sc/workspace/hermes-webui-extensions/proofshot",
            record_video_size={"width": 1440, "height": 900},
        )
        page = context.new_page()

        # 1. Navigate to session with file operations
        print("[1] Navigating to session...")
        page.goto(f"{DEV_URL}/session/{SESSION_ID}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        # 2. Wait for chips to appear
        print("[2] Waiting for file chips...")
        page.wait_for_selector(".ext-ws-foot-file", timeout=10000)
        chips = page.query_selector_all(".ext-ws-foot-file")
        print(f"    Found {len(chips)} chips")

        # 3. Hover over first chip to reveal tooltip
        print("[3] Hovering over chip 1...")
        chips[0].hover()
        page.wait_for_timeout(800)

        # 4. Click chip 1 to open file in workspace
        print("[4] Clicking chip 1...")
        chips[0].click()
        page.wait_for_timeout(2000)

        # 5. Hover over second chip
        if len(chips) > 1:
            print("[5] Hovering over chip 2...")
            chips[1].hover()
            page.wait_for_timeout(800)

            # 6. Click chip 2
            print("[6] Clicking chip 2...")
            chips[1].click()
            page.wait_for_timeout(2000)

        # 7. Hover over third chip
        if len(chips) > 2:
            print("[7] Hovering over chip 3...")
            chips[2].hover()
            page.wait_for_timeout(800)

            # 8. Click chip 3
            print("[8] Clicking chip 3...")
            chips[2].click()
            page.wait_for_timeout(2000)

        # Final state screenshot
        print("[9] Taking final screenshot...")
        page.screenshot(path="/home/sc/workspace/hermes-webui-extensions/proofshot/final-state.png")

        context.close()
        browser.close()
        print("[✓] Recording saved to proofshot/")

if __name__ == "__main__":
    main()
