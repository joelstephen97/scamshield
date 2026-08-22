# ScamShield models

Two tiny on-device models, trained here, shipped as JSON bundled into `.js` files (`npm run bundle:models`).

## URL model (`url-model.json`, HistGradientBoosting)
- Data: `model/data/real.csv` (OpenPhish + URLhaus positives, Tranco negatives expanded with realistic deep paths/queries; see `build_dataset.py`).
- Train + export + parity: `model/.venv/Scripts/python.exe model/train.py --compare-onnx model/data/onnx_040.onnx`
  - **`--compare-onnx` must point at the 0.4.0 RandomForest ONNX**, extracted with
    `git show 2299956:model/phishing-url.onnx > model/data/onnx_040.onnx` (untracked scratch file) —
    NOT the regenerated HistGradientBoosting ONNX this script itself writes to `model/phishing-url.onnx`/`--out`.
    Comparing against the freshly-regenerated file compares the model with itself and the agreement
    number becomes meaningless.
- Parity: `npm run gen:parity` (200 URLs) → `model/parity.json`; Python writes `url_parity.json`; `tests/unit/url_model_parity.test.js` asserts JS == Python (1e-4).
- Deep-URL regression gate: `model/data/legit_deep_urls.txt` (43 realistic legitimate deep/query URLs across well-known and obscure hosts, incl. .edu/.gov). Printed and enforced automatically after every training run (max prob ≤ 0.5, mean ≤ 0.2) — catches the model degenerating into a path-length detector, which is what shipped in early 0.5.0 (see the v0.5.0 final review: `https://docs.example.org/en/latest/api/reference/index.html` scored 1.000, `https://en.wikipedia.org/wiki/Phishing` scored 0.994, purely off path length/shape, because `real.csv` negatives were almost all bare homepages). `--skip-deep-gate` bypasses it for experiments only — never for a shipped model.
- Last run (0.5.0 final fix wave, see `.superpowers/sdd/2026-08-22-scamshield-v050-part1-engine/final-fix-report.md` for the full command output): acc 0.988, precision 0.993, recall 0.983, AUC 0.998 (18032 rows trained, 4508 holdout). Deep-URL gate: mean 0.110 (**passes** the ≤0.2 bar) but max 0.923 on one probe (`github.com/.../blob/master/README`) — **fails** the ≤0.5 bar after several rounds of enriching `BENIGN_PATHS`/`BENIGN_AUTH_PATHS` with longer and shorter deep-link shapes; a debug comparison showed that URL's feature vector (url_length=52, path_length=34, https, no other signal) is essentially indistinguishable, in this 17-feature syntactic space, from plausible-shaped phishing URLs already in the positive set — a genuine feature-space ceiling, not a fixable data gap. Verdict-level agreement with the 0.4.0 RandomForest ONNX: 0.689 (also below the ≥0.99 target) — expected, not a regression: the 0.4.0 model IS the path-length-biased detector this fix wave targets, so it disagrees with the corrected model most on exactly the deep-path-heavy holdout rows this retrain added.
- **Fallback applied** (per the fix brief, since the deep gate could not be made to pass on the feature set alone): `engine/verdict.js`'s content+URL-model corroboration now also requires `urlRules.score >= THRESHOLDS.contentCorroborateModelMinRule` (0.15) — the URL model alone can no longer promote a "suspicious" content verdict to "dangerous"; at least one URL rule must also have fired. See `tests/unit/verdict.test.js`.

## Page-content model (`page-content.json`, logistic regression over hashed tokens + 16 dense features)
- Data: `npm run crawl:pages` → `model/data/pages.jsonl` (gitignored; feature rows only — no HTML/text/URL paths).
- Train: `model/.venv/Scripts/python.exe model/train_page.py` → weights + `page_parity.json`.
- Last run (0.5.0): rows 2917 (pos 375 / neg 2542 / legit-login 269), 1915 distinct registrable domains, grouped-holdout AUC 0.886 (C=0.03, tried grid [0.03, 0.1, 0.3, 1, 3, 10] — best AUC still below the 0.97 gate), threshold 0.80 (min-threshold gate, chosen for precision — see below), recall@threshold 0.107, precision@threshold 1.000, FPR(all legit) 0.00 %, FPR(legit login) 0.00 % on 52 holdout legit-login pages (both ≤ 0.5 % target met).
- Threshold chosen for precision: the content model alone can only raise a page to "suspicious"; recall will improve as the opt-in reporting relay supplies more positives.
- Positives are below the ≥3000 target because live scam/phishing feeds are small on any given day; this is expected to improve as the opt-in reporting relay becomes the ongoing data source, and the model should be retrained periodically as `pages.jsonl` grows.
- Feature extractor is `engine/page_features.js` (shared by browser and crawler) — never reimplement it in Python.

The ONNX file is kept as the canonical artifact of the URL model but is not shipped.

## Pulling opt-in reports
Pull labelled rows from the live relay's export endpoint into the local training data:

```
model/.venv/Scripts/python.exe model/pull_reports.py --url https://scamshield-relay-seven.vercel.app/api/export --token $EXPORT_TOKEN
```

`EXPORT_TOKEN` is stored in the Vercel project's environment variables (and in Joel's local notes) — never commit it. The script resumes from `model/data/reports_cursor.txt` (or `--since <ISO timestamp>` on first run) and appends to:
- `model/data/pages.jsonl` — user-reported `scam`/`false_positive` rows, trusted labels, ready for `train_page.py`.
- `model/data/report_urls.csv` — the same reports as host-level URL rows for the URL model.
- `model/data/reports_review.jsonl` — auto-generated "dangerous" verdict rows. These are model output, not ground truth, and need manual review before they're promoted into `pages.jsonl`/training data.
