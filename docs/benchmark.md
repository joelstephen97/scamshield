# ScamShield benchmark (method + our own numbers)

Numbers ScamShield publishes about itself, and enough of the method for someone
else to reproduce or disagree with them. Filled in per release; the table below
carries every version we have measured, not only the newest.

## What is measured

Live phishing/malware URLs from public community feeds we do *not* ingest
(PhishTank, OpenPhish, URLhaus), sampled into **< 24 h**, **1–7 d** and
**7–30 d** buckets by first-seen time, liveness-checked minutes before the run;
plus benign controls (a Tranco top-1k sample and a hand-picked "hard benign" set
of regional banks, government portals and new-but-legit sites). Each URL is
visited once in a throwaway Chrome profile with the extension freshly installed
and warmed up for 90 s.

## Definitions

| Term | Meaning |
|---|---|
| **Blocked** | The navigation never reached the page (network-level rule). |
| **Stopped** | Blocked, *or* an interaction-blocking full-page interstitial on the loaded page. |
| **Warned** | A dismissible banner. |
| **Hard false positive** | A benign control that was blocked or stopped. |
| **Friction** | Any banner on a benign control. |

"Stopped" is the number that matters to a user: it counts both outcomes where
the scam never got a chance to work. "Blocked" is the stricter subset where the
page never loaded at all.

## Results

Run 2026-09-07. Corpus: 400 URLs built that morning from PhishTank, OpenPhish
and URLhaus plus Tranco and the hard-benign set, liveness-checked immediately
before each pass. The two builds were driven through the same corpus with the
same harness (throwaway profile, 90 s warm-up, 12 s navigation budget). The
0.12.1 pass ran in the afternoon; the 0.13.0 pass — the exact build that is
tagged v0.13.0 — ran about six hours later, after two feed-side fixes the first
0.13.0 pass had exposed. Only URLs that were still live in **both** passes are
counted below (279 phishing pages, 86 benign controls), so every row compares
the two builds on identical pages.

| version | bucket | n | blocked | stopped | warned |
|---|---|---|---|---|---|
| 0.13.0 | < 24 h | 134 | **56.0 %** (75) | **68.7 %** (92) | 7.5 % (10) |
| 0.13.0 | 1–7 d | 98 | 10.2 % (10) | 40.8 % (40) | 18.4 % (18) |
| 0.13.0 | 7–30 d | 47 | 21.3 % (10) | 66.0 % (31) | 17.0 % (8) |
| 0.13.0 | all phishing | 279 | 34.1 % (95) | 58.4 % (163) | 12.9 % (36) |
| 0.12.1 | < 24 h | 134 | 5.2 % (7) | 25.4 % (34) | 21.6 % (29) |
| 0.12.1 | 1–7 d | 98 | 8.2 % (8) | 34.7 % (34) | 15.3 % (15) |
| 0.12.1 | 7–30 d | 47 | 23.4 % (11) | 68.1 % (32) | 4.3 % (2) |
| 0.12.1 | all phishing | 279 | 9.3 % (26) | 35.8 % (100) | 16.5 % (46) |

The gain is concentrated in the < 24 h bucket, which is what the hourly hot
list was built for: pages blocked before they loaded went from 5.2 % to
56.0 %, and pages stopped from 25.4 % to 68.7 %. The two older buckets barely
move, which is what you would expect — a list that refreshes hourly helps most
where the pages are newest. The release's own targets for this bucket were
60 % blocked and 80 % stopped; it missed both. Every < 24 h page 0.13.0 did not
stop was absent from every threat list we are licensed to use at the time of
the run — the remaining gap is how fast those public sources learn about a new
page, not how the extension applies what they publish.

The headline figure quoted in the store listing and the README — 134 fresh
phishing pages, 56 % blocked before they loaded, 69 % stopped in total — is
the 0.13.0 < 24 h row of this table, rounded to whole percent.

Benign controls, both builds: **0 hard false positives** out of 86 (0 of 56
Tranco, 0 of 30 hard benign). Banner friction on the hard-benign set fell from
2 of 30 (6.7 %) on 0.12.1 to **0 of 30 (0.0 %)** on 0.13.0 — those two were the
Indian bank sites on national-style domains that 0.13.0's look-alike fix
addresses. Tranco friction is 1 of 56 (1.8 %) on both builds, an unchanged
page-builder host.

Network hosts the extension itself contacted during the whole run:
`raw.githubusercontent.com` (the threat lists and the hourly hot list) and
`cdn.jsdelivr.net` (the backup mirror for the same public files). Everything
else recorded was an icon or logo fetch for brand matching, aimed at a URL the
visited page had itself referenced: 38 distinct hosts that were the visited
page's own, and 13 distinct hosts the page pointed at for its icon (a site's
logo CDN, for instance). No request
went to a ScamShield server, because there is not one.

### Context: an earlier run on a different corpus

For continuity with the 2026-09-06 measurement, which used a smaller corpus
(336 URLs) built the day before: 0.12.1 blocked 15.1 % and stopped 50.0 % of
its < 24 h bucket (n=86), and blocked 13.0 % / stopped 50.2 % across all 231
live phishing rows. Those numbers are not comparable with the table above —
different day, different sample, different bucket sizes — and are recorded
only so the two runs are not mistaken for each other.

## What this does not show

- **Other products' numbers.** We measured several competitors in the same
  harness for our own roadmap and are not publishing those results.
- **Time-to-protect for the sources we ingest.** ScamShield's own feed is built
  from sources it does ingest, so measuring against them would flatter it. That
  latency is tracked in the feed repository instead.
- **Pages that were already dead at run time.** They are excluded from the
  sample rather than counted as a miss for anyone.
