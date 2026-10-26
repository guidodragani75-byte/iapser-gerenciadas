import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

p = os.path.expanduser('~/.clasprc.json')
with open(p, 'r', encoding='utf-8') as f:
    data = json.load(f)
tok = data['tokens']['default']

client_config = {
    "installed": {
        "client_id": tok['client_id'],
        "client_secret": tok['client_secret'],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost:8901"]
    }
}

flow = InstalledAppFlow.from_client_config(
    client_config,
    scopes=['https://www.googleapis.com/auth/drive.readonly']
)
print("Flow initialized successfully!")
