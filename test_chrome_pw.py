import os
from playwright.sync_api import sync_playwright

chrome_user_data = os.path.expanduser('~\\AppData\\Local\\Google\\Chrome\\User Data')
print("Launching Chrome persistent context...")

with sync_playwright() as p:
    try:
        context = p.chromium.launch_persistent_context(
            user_data_dir=chrome_user_data,
            channel="chrome",
            headless=True,
            args=[
                "--disable-extensions",
                "--no-first-run",
                "--disable-default-apps"
            ]
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://drive.google.com/drive/folders/1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk", timeout=20000)
        page.wait_for_timeout(3000)
        print("Page URL:", page.url)
        print("Page Title:", page.title())
        context.close()
    except Exception as e:
        print("Error:", e)
