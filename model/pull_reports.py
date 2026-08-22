"""model/pull_reports.py — pull opt-in reports from scamshield-relay and turn them
into labelled training rows. User reports are trusted labels; auto 'dangerous'
rows go to a review file (they are model output, not ground truth).

Usage:
    python model/pull_reports.py --url https://<relay>/api/export --token $EXPORT_TOKEN [--since ISO]

    The official relay export URL is:
        https://scamshield-relay-seven.vercel.app/api/export

    The token must be set from environment or passed explicitly:
        export EXPORT_TOKEN=<token from Vercel project>
        python model/pull_reports.py --url https://scamshield-relay-seven.vercel.app/api/export --token $EXPORT_TOKEN

    Optional --since flag (ISO 8601 timestamp) allows resuming from a past point.
    If omitted, the script reads the last cursor from model/data/reports_cursor.txt,
    or defaults to 1970-01-01T00:00:00Z on first run.

Output files:
    model/data/pages.jsonl
        Appends rows with user-reported labels (pageFeatures only).
        Schema: {"label": 0|1, "regDomain": str, "features": dict}
        Label: 1 for 'scam'/'dangerous' reports, 0 for 'false_positive'.

    model/data/reports_review.jsonl
        Appends auto-generated 'dangerous' rows for manual review.
        These are model outputs, not ground truth, and should be verified before
        adding to training data.

    model/data/report_urls.csv
        Appends host-level URL rows (one per report).
        Schema: https://{host}/,{label}
        Label: 1 for 'scam'/'dangerous', 0 for 'false_positive'.

    model/data/reports_cursor.txt
        Stores the last received_at timestamp for resuming pagination.

Note: The section for model/README.md will be added by the release task.
"""
import argparse, json, pathlib, urllib.request

DATA = pathlib.Path(__file__).parent / 'data'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--token', required=True)
    ap.add_argument('--since', default=None)
    a = ap.parse_args()

    cursor = DATA / 'reports_cursor.txt'
    since = a.since or (cursor.read_text().strip() if cursor.exists() else '1970-01-01T00:00:00Z')

    req = urllib.request.Request(
        f'{a.url}?since={since}&limit=20000',
        headers={'Authorization': f'Bearer {a.token}'}
    )
    lines = urllib.request.urlopen(req, timeout=120).read().decode('utf8').splitlines()

    pages = open(DATA / 'pages.jsonl', 'a', encoding='utf8')
    review = open(DATA / 'reports_review.jsonl', 'a', encoding='utf8')
    urls = open(DATA / 'report_urls.csv', 'a', encoding='utf8')

    last = since
    n_pages = n_rev = n_urls = 0

    for l in lines:
        if not l.strip():
            continue
        row = json.loads(l)
        p = row['payload']
        last = row['received_at']

        label = 1 if p['label'] in ('scam', 'dangerous') else 0

        if p['kind'] == 'auto':
            review.write(json.dumps(row) + '\n')
            n_rev += 1
            continue

        if p.get('pageFeatures'):
            pages.write(json.dumps({
                'label': label,
                'regDomain': p['regDomain'],
                'features': p['pageFeatures']
            }) + '\n')
            n_pages += 1

        urls.write(f"https://{p['host']}/,{label}\n")
        n_urls += 1

    pages.close()
    review.close()
    urls.close()

    cursor.write_text(last)
    print(f'pages +{n_pages}, review +{n_rev}, urls +{n_urls}; cursor={last}')

if __name__ == '__main__':
    main()
