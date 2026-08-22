# ScamShield models

Two tiny on-device models, trained here, shipped as JSON bundled into `.js` files (`npm run bundle:models`).

## URL model (`url-model.json`, HistGradientBoosting)
- Data: `model/data/real.csv` (OpenPhish + URLhaus positives, Tranco negatives; see `build_dataset.py`).
- Train + export + parity: `model/.venv/Scripts/python.exe model/train.py --compare-onnx model/phishing-url.onnx`
- Parity: `npm run gen:parity` (200 URLs) → `model/parity.json`; Python writes `url_parity.json`; `tests/unit/url_model_parity.test.js` asserts JS == Python (1e-4).
- Last run (0.5.0): acc 0.993, precision 0.998, recall 0.988, AUC 0.998 (18032 rows trained, 4508 holdout); agreement with 0.4.0 ONNX 0.9958; parity 200/200.

## Page-content model (`page-content.json`, logistic regression over hashed tokens + 16 dense features)
- Data: `npm run crawl:pages` → `model/data/pages.jsonl` (gitignored; feature rows only — no HTML/text/URL paths).
- Train: `model/.venv/Scripts/python.exe model/train_page.py` → weights + `page_parity.json`.
- Last run (0.5.0): rows 2917 (pos 375 / neg 2542 / legit-login 269), 1915 distinct registrable domains, grouped-holdout AUC 0.886 (C=0.03, tried grid [0.03, 0.1, 0.3, 1, 3, 10] — best AUC still below the 0.97 gate), threshold 0.54 (login FPR 0 % on 52 holdout legit-login pages, ≤ 0.5 % target met), recall@threshold 0.482 on the holdout.
- Positives are below the ≥3000 target because live scam/phishing feeds are small on any given day; this is expected to improve as the opt-in reporting relay becomes the ongoing data source, and the model should be retrained periodically as `pages.jsonl` grows.
- Feature extractor is `engine/page_features.js` (shared by browser and crawler) — never reimplement it in Python.

The ONNX file is kept as the canonical artifact of the URL model but is not shipped.
