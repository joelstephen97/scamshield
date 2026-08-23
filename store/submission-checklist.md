# Submission Checklist

## 0.3.1 re-submission (after the Jun 2026 "Use of Permissions" rejection)
Reviewer note to include with the draft:
> Removed the unused `scripting` permission flagged in the previous review
> (violation ref "Purple Potassium"). Content scripts are statically declared
> in the manifest; the `chrome.scripting` API is not used anywhere. All
> remaining permissions (storage, declarativeNetRequest, alarms) are actively
> used — see the updated permissions justification. No functional change to
> injection behavior; `web_accessible_resources` was additionally narrowed.

## Pre-flight
- [ ] `npm test` passes (unit + e2e).
- [ ] `npm run build` produces dist/scamshield-chrome.zip and -firefox.zip.
- [ ] Replace placeholder icons in assets/icons with final art (16/32/48/128).
- [ ] Capture screenshots (store/screenshots).
- [ ] Host privacy-policy.md somewhere public; note the URL.
- [ ] Bump version in BOTH manifest.json and manifest.firefox.json if re-submitting.

## Chrome Web Store
- [ ] Create/Log in to a developer account (one-time $5 fee).
- [ ] Dashboard → New item → upload dist/scamshield-chrome.zip.
- [ ] Fill listing from store/chrome-listing.md; add screenshots + privacy URL.
- [ ] Justify permissions from store/permissions-justification.md.
- [ ] Set distribution/visibility; submit for review.

## Firefox AMO
- [ ] Create an addons.mozilla.org account (free).
- [ ] Submit New Add-on → upload dist/scamshield-firefox.zip.
- [ ] Provide source-code note (model trained via model/train.py; no remote code).
- [ ] Fill listing from store/firefox-listing.md; add screenshots + privacy URL.
- [ ] Submit for review.

## Post-publish
- [ ] Tag the release in git: `git tag v0.1.0 && git push --tags`.
- [x] Save store URLs in README (Chrome Web Store: https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl; AMO: pending).
