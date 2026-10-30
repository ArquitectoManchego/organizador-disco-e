import urllib.request
import re

url = "https://www.foldersizes.com/download/downloading"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
        matches = re.findall(r'https?://[^\s"\'<>]+\.(?:exe|zip|msi)', html, re.I)
        print("Found installer URLs:", matches)
except Exception as e:
    print("Error:", e)
