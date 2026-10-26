import urllib.request
import re

fid = '1poEoAF2DmFBimVkLJHBspKEzkErNE66t'
u = f'https://drive.usercontent.google.com/download?id={fid}&export=download'
req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

print('Title:', re.findall(r'<title>(.*?)</title>', html))
print('Form action:', re.findall(r'action="(.*?)"', html))
print('Confirm input:', re.findall(r'name="confirm"\s+value="(.*?)"', html))
print('Download link:', re.findall(r'href="(https://drive\.usercontent\.google\.com/download.*?)"', html))
