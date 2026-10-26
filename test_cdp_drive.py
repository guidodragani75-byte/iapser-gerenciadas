from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    page = context.new_page()
    page.goto("https://drive.google.com/drive/folders/1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk")
    page.wait_for_timeout(4000)
    print("Page URL:", page.url)
    print("Page Title:", page.title())
    page.close()
