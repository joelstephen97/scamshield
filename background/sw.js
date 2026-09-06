// ES-module service worker entry (Chrome). The engine files are UMD scripts
// that attach to globalThis, so importing them for side effects reproduces the
// old importScripts() environment. Firefox keeps loading the same files plus
// service_worker.js as classic background scripts via manifest.firefox.json,
// so service_worker.js itself must stay free of import/export syntax.
import '../engine/constants.js';
import '../engine/trust.js';
import '../engine/features.js';
import '../engine/risk_rules.js';
import '../engine/image_hash.js';
import '../engine/brand_icons.js';
import '../engine/report_payload.js';
import '../engine/engagement.js';
import '../engine/blockset.js';
import '../engine/bloom.js';
import '../engine/first_seen.js';
import '../engine/dnr_rules.js';
import '../ui/reasons.js';
import './stats.js';
import './blockstore.js';
import './update.js';
import './service_worker.js';
