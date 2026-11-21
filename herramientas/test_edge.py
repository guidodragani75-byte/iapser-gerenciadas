from playwright.sync_api import sync_playwright
import os

user_data_dir = os.path.expanduser('~\\AppData\\Local\\Microsoft\\Edge\\User Data')

with sync_playwright() as p:
    try:
        # Launch persistent context with Edge channel
        browser = p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            channel="msedge",
            headless=True,
            args=["--no-first-run", "--no-default-browser-check"]
        )
        page = browser.new_page()
        page.goto("https://drive.google.com/drive/folders/1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk", timeout=15000)
        page.wait_for_timeout(3000)
        print("Page title:", page.title())
        print("Page URL:", page.url)
        browser.close()
    except Exception as e:
        print("Error with Edge:", e)
