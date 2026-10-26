import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

clasprc_path = os.path.expanduser('~/.clasprc.json')
with open(clasprc_path, 'r', encoding='utf-8') as f:
    data = json.load(f)
tok = data['tokens']['default']

client_config = {
    "installed": {
        "client_id": tok['client_id'],
        "client_secret": tok['client_secret'],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost:8901/"]
    }
}

flow = InstalledAppFlow.from_client_config(
    client_config,
    scopes=['https://www.googleapis.com/auth/drive.readonly']
)

print("Starting local server on port 8901 for OAuth authorization...")
# run_local_server will open the browser automatically
creds = flow.run_local_server(port=8901, prompt='consent')

token_data = {
    'access_token': creds.token,
    'refresh_token': creds.refresh_token,
    'token_uri': creds.token_uri,
    'client_id': creds.client_id,
    'client_secret': creds.client_secret,
    'scopes': creds.scopes
}

with open('drive_readonly_token.json', 'w', encoding='utf-8') as f:
    json.dump(token_data, f, indent=2)

print("Authorization successful! Token saved to drive_readonly_token.json")
