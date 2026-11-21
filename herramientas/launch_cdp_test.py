import subprocess
import time
import os
import urllib.request
from playwright.sync_api import sync_playwright

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
user_data = os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data")

proc = subprocess.Popen([
    chrome_path,
    f"--user-data-dir={user_data}",
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    "--headless=new",
    "--enable-logging=stderr",
    "--v=1",
    "https://drive.google.com/drive/folders/1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk"
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

print("Chrome process launched, pid:", proc.pid)
time.sleep(3)
out, err = proc.communicate(timeout=2)
print("OUT:", out.decode('utf-8', errors='ignore'))
print("ERR:", err.decode('utf-8', errors='ignore'))
