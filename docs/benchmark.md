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

| version | bucket | blocked | stopped | warned |
|---|---|---|---|---|
| 0.13.0 | < 24 h | | | |
| 0.13.0 | 1–7 d | | | |
| 0.13.0 | 7–30 d | | | |
| 0.13.0 | benign controls | | | |

Benign controls: hard false positives — ; friction — .
Extension-attributed network hosts observed during the run: .

## What this does not show

- **Other products' numbers.** We measured several competitors in the same
  harness for our own roadmap and are not publishing those results.
- **Time-to-protect for the sources we ingest.** ScamShield's own feed is built
  from sources it does ingest, so measuring against them would flatter it. That
  latency is tracked in the feed repository instead.
- **Pages that were already dead at run time.** They are excluded from the
  sample rather than counted as a miss for anyone.
