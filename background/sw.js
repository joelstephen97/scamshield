// ES-module service worker entry (Chrome). The engine files are UMD scripts
// that attach to globalThis, so importing them for side effects reproduces the
// old importScripts() environment. Firefox keeps loading the same files plus
// service_worker.js as classic background scripts via manifest.firefox.json,
// so service_worker.js itself must stay free of import/export syntax.
import '../engine/constants.js';
import '../engine/trust.js';
import '../engine/features.js';
import '../engine/image_hash.js';
import '../engine/brand_icons.js';
import '../engine/report_payload.js';
import '../engine/engagement.js';
import './service_worker.js';
