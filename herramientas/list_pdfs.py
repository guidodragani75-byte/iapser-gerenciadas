import json
import os
import urllib.request
import urllib.parse

def get_drive_token():
    clasprc_path = os.path.expanduser('~/.clasprc.json')
    with open(clasprc_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    tok_data = data['tokens']['default']
    return tok_data['access_token']

def list_folder_files(folder_id):
    token = get_drive_token()
    files = []
    page_token = None
    q = f"'{folder_id}' in parents and trashed = false"
    while True:
        params = {
            'q': q,
            'fields': 'nextPageToken, files(id, name, mimeType, webViewLink, size)',
            'pageSize': 100
        }
        if page_token:
            params['pageToken'] = page_token
        url = 'https://www.googleapis.com/drive/v3/files?' + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            files.extend(res.get('files', []))
            page_token = res.get('nextPageToken')
            if not page_token:
                break
    return files

if __name__ == '__main__':
    folder_id = '1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk'
    files = list_folder_files(folder_id)
    print(f"Total items: {len(files)}")
    pdf_files = [f for f in files if f['mimeType'] == 'application/pdf']
    print(f"PDF items: {len(pdf_files)}")
    for i, f in enumerate(pdf_files):
        print(f"{i+1}. {f['name']} | ID: {f['id']} | Size: {f.get('size')} bytes")
