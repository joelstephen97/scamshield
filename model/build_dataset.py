"""Build a real-world url,label training CSV for train.py.

Positives (label 1): live phishing/malware-distribution URLs from OpenPhish
and URLhaus — the same public sources that power the scamshield-feed
blocklist.
Negatives (label 0): Tranco top-ranked domains expanded into realistic URLs
(homepages plus common benign paths), so the model does not learn a
"has a path = phishing" shortcut. Regional brand storefronts (amazon.ae
style) are included explicitly so ccTLD logins score safe.

Deterministic (fixed RNG seed). Run, then retrain:
    python model/build_dataset.py
    python model/train.py --data model/data/real.csv
"""
import csv
import io
import random
import re
import urllib.request
import zipfile
from pathlib import Path

OPENPHISH_URL = 'https://openphish.com/feed.txt'
URLHAUS_URL = 'https://urlhaus.abuse.ch/downloads/csv_online/'
TRANCO_URL = 'https://tranco-list.eu/top-1m.csv.zip'
OUT = Path(__file__).parent / 'data' / 'real.csv'

NEG_DOMAINS = 9000          # Tranco domains used for negatives
POS_CAP = 12000             # max positives kept
BENIGN_PATHS = [
    '', '', '', 'about', 'contact', 'products', 'blog/2026/08/news',
    'search?q=shoes', 'help/faq', 'careers', 'pricing', 'docs/getting-started',
    'category/electronics?page=2', 'watch?v=abc123', 'articles/how-to-cook-rice'
]
# Login-shaped benign URLs: real sites have these too, and the model must not
# treat the mere presence of "login"/"signin" as phishing.
BENIGN_AUTH_PATHS = ['login', 'signin', 'account/login', 'auth/signin', 'account']
REGIONAL_LEGIT = [
    'https://www.amazon.ae/ap/signin', 'https://www.amazon.co.uk/ap/signin',
    'https://www.amazon.in/gp/css/homepage.html', 'https://www.amazon.com.au/',
    'https://www.google.com.sg/search?q=weather', 'https://accounts.google.com/signin',
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'https://www.netflix.com/ae-en/login', 'https://www.dbs.com.sg/personal/login',
    'https://www.maybank2u.com.my/home/m2u/common/login.do',
    'https://member.shopee.sg/buyer/login', 'https://www.lazada.sg/customer/account/login',
    'https://www.paypal.com/ae/signin', 'https://www.grab.com/sg/',
    'https://internet.dbs.com.sg/', 'https://outlook.live.com/owa/',
]


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'scamshield-dataset-builder'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    rng = random.Random(42)

    print('Downloading OpenPhish…')
    openphish = fetch(OPENPHISH_URL).decode('utf-8', 'replace').splitlines()
    print(f'  {len(openphish)} URLs')

    print('Downloading URLhaus…')
    urlhaus_raw = fetch(URLHAUS_URL).decode('utf-8', 'replace')
    urlhaus = re.findall(r'^"?\d+"?,"?[^",]+"?,"([^"]+)"', urlhaus_raw, re.M)
    print(f'  {len(urlhaus)} URLs')

    print('Downloading Tranco…')
    zbuf = fetch(TRANCO_URL)
    with zipfile.ZipFile(io.BytesIO(zbuf)) as z:
        csv_text = z.read(z.namelist()[0]).decode('utf-8', 'replace')
    tranco = []
    for line in csv_text.splitlines():
        parts = line.strip().split(',')
        if len(parts) == 2:
            tranco.append(parts[1].lower())
        if len(tranco) >= NEG_DOMAINS:
            break
    print(f'  {len(tranco)} domains')

    # --- positives ---
    pos, seen = [], set()
    for u in openphish + urlhaus:
        u = u.strip()
        if not u.lower().startswith(('http://', 'https://')):
            continue
        if u in seen:
            continue
        seen.add(u)
        pos.append(u)
        if len(pos) >= POS_CAP:
            break

    # --- negatives ---
    neg = list(REGIONAL_LEGIT)
    for d in tranco:
        scheme = 'https://'
        host = ('www.' + d) if rng.random() < 0.4 and not d.startswith('www.') else d
        path = rng.choice(BENIGN_AUTH_PATHS) if rng.random() < 0.12 else rng.choice(BENIGN_PATHS)
        neg.append(f'{scheme}{host}/{path}')
    # keep classes roughly balanced
    n = min(len(pos), len(neg))
    pos, neg = pos[:n], neg[:n]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['url', 'label'])
        rows = [(u, 1) for u in pos] + [(u, 0) for u in neg]
        rng.shuffle(rows)
        w.writerows(rows)
    print(f'Wrote {OUT} ({len(rows)} rows: {len(pos)} phishing, {len(neg)} legit).')


if __name__ == '__main__':
    main()
