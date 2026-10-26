import subprocess
import time
import os
import urllib.request

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
user_data = os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data")

# Kill any existing chrome
os.system("taskkill /F /IM chrome.exe >nul 2>&1")
time.sleep(1)

proc = subprocess.Popen([
    chrome_path,
    f"--user-data-dir={user_data}",
    "--remote-debugging-port=9222",
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    "--headless",
    "about:blank"
])

print("Launched Chrome, waiting...")
for i in range(10):
    time.sleep(1)
    try:
        with urllib.request.urlopen("http://127.0.0.1:9222/json/version") as r:
            print("Connected! Response:", r.read().decode('utf-8'))
            break
    except Exception as e:
        print(f"Attempt {i+1}: {e}")

proc.terminate()
