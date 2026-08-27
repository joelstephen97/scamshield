(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Fake browser-update detection (0.6.0). SocGholish/ClearFake-style pages
  // render a "your browser is out of date" prompt with a download — but real
  // update prompts are browser chrome and NEVER appear inside a web page, so
  // the combination (browser brand + update wording + a download that does not
  // go to the real vendor) has an essentially zero legitimate base rate. The
  // one legitimate look-alike — old-browser notice libraries — links to the
  // vendor's own site, which is exactly what the vendor-domain check excludes.
  const BROWSER_RE = /\b(google\s+chrome|chrome|mozilla\s+firefox|firefox|microsoft\s+edge|opera|brave|safari|your\s+browser)\b/i;
  const UPDATE_RE = /\b(update\s+(is\s+)?(required|available|needed|now)|out[\s-]?of[\s-]?date|outdated\s+(browser|version)|critical\s+(browser\s+|security\s+)?update|update\s+your\s+browser|browser\s+update)\b/i;

  // Registrable domains that legitimately serve browser updates/downloads.
  const VENDOR_DOMAINS = [
    'google.com', 'chrome.com', 'mozilla.org', 'firefox.com', 'getfirefox.com',
    'microsoft.com', 'microsoftedge.com', 'apple.com', 'opera.com', 'brave.com',
    'browser-update.org'
  ];

  function isVendorHost(host) {
    const h = String(host || '').toLowerCase();
    return VENDOR_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
  }

  // input: { text, updateAnchorHosts: [hostnames of download/update anchors],
  //          hasBlobDownload: boolean (download attr / blob:/data: href) }
  function scoreFakeUpdate(input) {
    const s = input || {};
    const text = String(s.text || '');
    const reasons = [];
    const flags = [];
    if (!(BROWSER_RE.test(text) && UPDATE_RE.test(text))) return { level: 'none', reasons, flags };
    const anchorHosts = Array.isArray(s.updateAnchorHosts) ? s.updateAnchorHosts : [];
    const nonVendor = anchorHosts.filter((h) => h && !isVendorHost(h));
    const hasBadDownload = nonVendor.length > 0 || s.hasBlobDownload === true;
    if (hasBadDownload) {
      flags.push('fake-browser-update');
      reasons.push({ code: 'fakeUpdatePrompt', kind: 'page' });
      return { level: 'dangerous', reasons, flags };
    }
    // Update wording without a download we can attribute — note it, stay quiet.
    return { level: 'none', reasons, flags };
  }

  return { scoreFakeUpdate, __fakeUpdateVendors: VENDOR_DOMAINS };
});
