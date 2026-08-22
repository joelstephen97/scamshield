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
# Deliberately path/query-heavy (only 2/46 are homepages): a v0.4.0 review found
# the URL model had learned "long path = phishing" purely because negatives were
# ~all homepages. These mirror real deep-link shapes (docs, wikis, blog posts,
# account settings, support articles, search results, catalog/category pages,
# HR/enterprise intranet forms) so the model sees long, multi-segment,
# query-bearing paths on the LEGITIMATE side too.
BENIGN_PATHS = [
    '', '',
    'about', 'contact', 'products', 'pricing', 'careers',
    'docs/en/latest/api/reference/index.html',
    'docs/en/latest/getting-started/installation.html',
    'wiki/Phishing',
    'wiki/Two-factor_authentication',
    'blog/2025/08/22/some-long-title-with-words-in-it',
    'blog/2025/08/22/some-long-title-with-words-in-it?utm_source=newsletter',
    'blog/2026/01/15/product-update-notes-and-highlights',
    'account/settings/security/two-factor',
    'account/settings/profile/edit',
    'account/settings/privacy/data-export',
    'hr/benefits/enrollment/confirm.aspx',
    'hr/benefits/enrollment/summary.aspx',
    'support/articles/123456-how-to-reset-your-password',
    'support/articles/654321-how-to-contact-support',
    'search?q=shoes&page=3',
    'search?q=laptop+deals&sort=price',
    'products/category/electronics/sub-category/laptops/item-name-123',
    'products/category/home-and-garden/sub-category/furniture/item-456',
    'legal/privacy-policy',
    'legal/terms-of-service',
    'careers/jobs/senior-software-engineer-remote',
    'careers/jobs/product-manager-abu-dhabi',
    'help/faq',
    'help/faq?topic=billing',
    'watch?v=abc123xyz',
    'articles/how-to-cook-rice',
    'category/electronics?page=2',
    'news/2026/08/22/market-update',
    'news/2026/08/22/market-update?ref=homepage',
    'press/releases/2026-08-22-quarterly-earnings',
    'investor-relations/annual-report-2025.pdf',
    'community/forums/thread/123456-welcome-new-members',
    'community/forums/thread/123456-welcome-new-members?page=2',
    'community/forums/category/general-discussion',
    'store/orders/history?year=2026',
    'store/orders/12345678/tracking',
    'account/orders/return-request?orderId=12345',
    'settings/notifications/preferences',
    'developers/docs/api/v2/reference',
    'developers/docs/api/v2/reference?lang=python',
    'developers/docs/api/v2/authentication',
    'events/2026/annual-conference/schedule',
    'partners/directory?region=apac',
    # Longer real-world doc/wiki/forum/blog slugs (70-160 chars). Negatives
    # capped out around 66 chars of path before this addition, well short of
    # real long-slug legitimate pages (MDN nested reference paths, SO/forum
    # question titles, long blog headlines) — the model was learning "long
    # path = phishing" purely from that gap, not from anything phishing-specific.
    'en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
    'en-US/docs/Web/API/Fetch_API/Using_Fetch',
    'questions/12345678/how-to-reverse-a-string-in-python-without-using-slicing',
    'questions/87654321/what-is-the-difference-between-let-const-and-var-in-javascript?rq=1',
    '3/library/urllib.parse.html#urllib.parse.urlparse',
    'blog/2025/08/22/a-long-descriptive-post-title-about-technology-trends-in-artificial-intelligence?utm_source=share',
    'support/articles/1234567890-a-detailed-article-explaining-account-recovery-and-two-factor-setup',
    'developers/docs/api/v3/reference/authentication/oauth2/scopes/read-write-delete-permissions?lang=en',
    'community/forums/thread/9876543210-a-long-thread-title-about-troubleshooting-network-issues?page=2',
    'wiki/List_of_articles_with_unusually_long_and_descriptive_titles_for_testing_purposes',
    'terms/1234567890_a_publication_with_a_long_descriptive_title_about_a_narrow_research_topic?format=pdf',
    'story/how-a-widely-used-security-technique-quietly-changed-the-way-people-browse-the-web',
    # Short/plain doc-repo and content-platform shapes that scored high on the
    # deep-URL regression gate in earlier retrain passes: an unadorned repo
    # blob path with no file extension, a numeric help/support node id, a
    # trailing-slash landing page, a numeric content id under a category, and
    # an arXiv-style paper id — none of these are "long", they were being
    # flagged on path shape alone, so they need direct representation too.
    'org/repo/blob/main/README',
    'org/repo/blob/master/CONTRIBUTING.md',
    'en/node/412',
    'admissions/apply/',
    'jobs/view/1234567890/',
    'r/technology/comments/1a2b3c4/a_discussion_thread_about_recent_developments/',
    'abs/2301.12345',
    'questions/12345678/a-short-question-title',
]
# Login-shaped benign URLs: real sites have these too, and the model must not
# treat the mere presence of "login"/"signin" as phishing. Half carry the
# query-string params real SSO/auth flows use (next/returnUrl/client_id/
# redirect_uri) so the model doesn't learn "auth path + query = phishing"
# either.
BENIGN_AUTH_PATHS = [
    'login', 'signin', 'account/login', 'auth/signin', 'account',
    'login?next=%2Faccount',
    'signin/v2/identifier?service=mail&continue=https%3A%2F%2Fmail.example.com%2Fmail%2F',
    'oauth2/v2.0/authorize?client_id=abcd1234&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&response_type=code',
    'account/login?returnUrl=%2Fdashboard',
    'auth/realms/main/protocol/openid-connect/auth?client_id=web&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code',
]
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
        path = rng.choice(BENIGN_AUTH_PATHS) if rng.random() < 0.15 else rng.choice(BENIGN_PATHS)
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
