import os
import json
import base64
import sqlite3
import shutil
import win32crypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Let's test on Edge or Chrome
def test_cookie_decryption(browser='Edge'):
    if browser == 'Edge':
        local_state_path = os.path.expanduser(r'~\AppData\Local\Microsoft\Edge\User Data\Local State')
        cookie_path = os.path.expanduser(r'~\AppData\Local\Microsoft\Edge\User Data\Default\Network\Cookies')
    else:
        local_state_path = os.path.expanduser(r'~\AppData\Local\Google\Chrome\User Data\Local State')
        cookie_path = os.path.expanduser(r'~\AppData\Local\Google\Chrome\User Data\Default\Network\Cookies')
        
    if not os.path.exists(local_state_path) or not os.path.exists(cookie_path):
        print(f"{browser} paths not found")
        return
        
    with open(local_state_path, 'r', encoding='utf-8') as f:
        local_state = json.load(f)
    encrypted_key = base64.b64decode(local_state['os_crypt']['encrypted_key'])
    encrypted_key = encrypted_key[5:] # strip DPAPI prefix
    key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]
    print(f"{browser} key decrypted successfully! Length:", len(key))
    
    # Copy cookies DB to temp
    temp_db = f'temp_cookies_{browser}.db'
    shutil.copyfile(cookie_path, temp_db)
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT host_key, name, encrypted_value FROM cookies WHERE host_key LIKE '%google%' LIMIT 5")
    rows = cursor.fetchall()
    print(f"Found {len(rows)} google cookies in {browser}")
    for host, name, enc_val in rows:
        if enc_val.startswith(b'v10') or enc_val.startswith(b'v20'):
            prefix = enc_val[:3]
            nonce = enc_val[3:15]
            ciphertext = enc_val[15:]
            try:
                cipher = AESGCM(key)
                val = cipher.decrypt(nonce, ciphertext, None).decode('utf-8', errors='ignore')
                print(f"  Decrypted cookie: {name} ({len(val)} chars) [prefix: {prefix.decode()}]")
            except Exception as e:
                print(f"  Decrypt error for {name} ({prefix}):", e)
    conn.close()
    if os.path.exists(temp_db): os.remove(temp_db)

print("--- Testing Edge ---")
try:
    test_cookie_decryption('Edge')
except Exception as e:
    print("Edge error:", e)

print("--- Testing Chrome ---")
try:
    test_cookie_decryption('Chrome')
except Exception as e:
    print("Chrome error:", e)
