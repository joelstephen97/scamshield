# Task 14b - warnings on zoomed-out touch pages (no viewport meta)

## Approach
- `content/surfaces/primitives.js`: `compactMetrics()` runs at mount and on `visualViewport` `resize`/`scroll` plus window `resize` (rAF-throttled, listeners bound only while a surface is live). When the page is zoomed out on a touch device it sets `data-compact` on the host, pins the host to the visual viewport rect (`left/top/width/height`, `contain:layout` so it becomes the containing block of the fixed cards, `pointer-events:none`), and exposes `--ss-z` (zoom), `--ss-vw/--ss-vh` and `--ss-dx/--ss-dy` (visual-viewport size and centre offset from the layout viewport centre).
- Zoom factor `z = 1 / visualViewport.scale` (layout px per device px right now), so the card stays device sized even while the user pinches, and the bottom sheet follows the visual viewport (offsetTop/offsetLeft/height) rather than the layout viewport.
- `content/surfaces/styles.js`: a `phone(rules)` helper emits ONE rule list under both `@media (max-width:599px)` and `:host([data-compact])` (banner, dialog/interstitial, toast); no duplication. Compact-only extras: `zoom:var(--ss-z)` on the banner / toast / ack / dialog `.ss-card`, `max-block-size` from the host (not 100dvh), and for the top-layer dialog (which ignores the host box) card size from `--ss-vw/--ss-vh` and a `translate()` onto the visual-viewport centre. Logical properties only; class names unchanged. 44px targets come from the shared phone list plus `(pointer:coarse)`, now scaled by the zoom.
- `zoom` is feature-detected (`CSS.supports('zoom','1')`); no `zoom` => no compaction (behaviour as before). No transform fallback was built (Chrome >=121 and Firefox >=126 both support zoom, floor is Firefox 142).
- `tests/e2e/server.js`: `?viewport=1` serves any `.html` fixture with `<meta name="viewport" content="width=device-width, initial-scale=1">` inserted after the doctype (no fixture had a meta, so a twin file per fixture was unnecessary; the default is still no meta).
- `tools/screenshot-matrix.js`: touch variants shoot each surface twice, `...-touch-nometa.png` and `...-touch-meta.png` (meta variant wraps `page.goto` to add `?viewport=1`). Non-touch names unchanged.

## Scale detection
`s = window.innerWidth / (visualViewport.width * visualViewport.scale)`, compact when `matchMedia('(pointer: coarse)')` and `s > 1.15`. `visualViewport.width * scale` is the device width in CSS px and is invariant under pinch zoom (width and scale move in opposite directions), so pinching never flips the mode. If `visualViewport` is missing, `screen.width` is the device width. Verified on Chromium 1xx via Playwright (isMobile + hasTouch, 375x812, dsf 2; no-meta page => innerWidth 980, s about 2.6; meta page => s = 1). NOT verified on Firefox Android or real Chrome Android (no device here); formula relies only on standard visualViewport semantics both implement.

## Context choice
Chromium accepted `isMobile:true, hasTouch:true` on `launchPersistentContext` with the extension loaded (the matrix tool already did this), so no CDP `setDeviceMetricsOverride` was needed. Pinch is emulated with CDP `Emulation.setPageScaleFactor`.

## Tests (tests/e2e/surfaces-host.spec.js, new)
1. No-meta touch page: host has `data-compact`; card width >= 90% of device width; card bottom within 4px of visual viewport bottom; Leave button >= 44 device px; all action buttons >= 44.
2. Same page with `?viewport=1`: no `data-compact`, same bottom-sheet geometry.
3. No-meta page pinch-zoomed to 2.5x: card still >= 90% device width, bottom on visual bottom, Leave >= 44.
Surfaces-host spec 17/17 green; full e2e suite 262/262 with --retries=0.

## Images inspected (C:\Users\PC\AppData\Local\Temp\ss-matrix-14b\screenshots)
- banner-warn/375-dark-de-touch-nometa.png: bottom sheet, readable German text, buttons about 44px, page behind tiny (correct, zoomed out). Matches -touch-meta.png.
- banner-warn/375-dark-de-touch-meta.png: reference bottom sheet, same size as above.
- banner-danger/375-light-en-touch-nometa.png and 375-dark-de-touch-nometa.png: red sheet at device size, full width, Leave/more/close all large; was tiny top card before.
- banner-danger/375-light-en.png (non-touch): unchanged bottom sheet.
- interstitial/375-light-en-touch-nometa.png and 375-dark-de-touch-nometa.png: opaque stop page, centred card at device size, stacked 44px buttons, matches the -touch-meta twin (dark-de meta also viewed).
36 images generated, 0 failures.

## Concerns
- Not verified on real Firefox/Chrome Android; Firefox Android's `visualViewport.scale` and dynamic toolbar resizing should be re-checked on device.
- With `?viewport=1` the interstitial address row shows the query string (matrix-only artefact).
- Toast/ack/formguard/wallet compact paths use the same CSS but have no dedicated e2e or matrix image in this task's requested set.
- Host `contain:layout` relies on the host being the containing block for fixed cards inside a popover top-layer host; it works in Chromium (tests), unverified in Firefox.
