// Page-content features shared by the browser (content script) and the Node
// training crawler (linkedom). DOM-API subset ONLY: querySelectorAll,
// getAttribute, textContent, document.title — no innerText/getComputedStyle/layout.
(function (root, factory) {
  const mod = factory(typeof require === 'function' ? require('./constants') : root.Parry);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';
  const PAGE_BUCKETS = 32768;
  const PAGE_DENSE_NAMES = ['n_forms', 'n_inputs', 'n_password', 'n_hidden_inputs', 'n_links',
    'external_link_ratio', 'dead_href_ratio', 'same_host_link_ratio', 'n_iframes', 'n_images',
    'n_scripts', 'text_len_log', 'has_nav_or_header_footer', 'has_lang_attr', 'has_icon_link',
    'login_words_in_inputs'];
  const LOGIN_WORDS = ['password', 'passwd', 'otp', 'pin', 'card', 'cvv', 'cvc', 'ssn', 'iban', 'mnemonic', 'seed'];

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function tokenize(s) {
    return String(s || '').toLowerCase().split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2).map((t) => (/^\d+$/.test(t) ? '#num' : t));
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const text = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();

  // body textContent minus script/style/noscript/template content. Iterative
  // pre-order DFS (explicit stack) rather than recursive, to avoid a
  // call-stack blowout on pathologically deep DOMs, with a budget
  // (chars/nodes) as a second backstop. A node's text is appended only when
  // it is POPPED off the stack (not while its parent is being iterated) and
  // an element's children are pushed in reverse order at that same pop, so
  // the next pops walk them left-to-right — this is what keeps the collected
  // text in original document order (the shipped model was trained on
  // document-order text). Exported as `_bodyText` for unit testing only.
  function _bodyText(doc) {
    const body = doc.body || doc.documentElement;
    let bodyText = '';
    if (!body) return bodyText;
    const BODY_TEXT_BUDGET = 60000, BODY_NODE_BUDGET = 20000;
    const skip = new Set(Array.from(doc.querySelectorAll('script,style,noscript,template')));
    const stack = [body];
    let visited = 0;
    while (stack.length && bodyText.length <= BODY_TEXT_BUDGET && visited < BODY_NODE_BUDGET) {
      const n = stack.pop();
      visited++;
      if (n.nodeType === 3) {
        bodyText += n.nodeValue + ' ';
      } else if (n.nodeType === 1 && !skip.has(n)) {
        const children = n.childNodes || [];
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
    }
    return bodyText;
  }

  function extractPageFeatures(doc, opts) {
    const host = String((opts && opts.host) || '').toLowerCase();
    const pageDomain = C.registrableDomain(host);
    const tokens = {};
    let nTokens = 0;
    function add(prefix, toks, cap, bigrams) {
      const list = toks.slice(0, cap);
      for (const t of list) { const b = fnv1a(prefix + t) & (PAGE_BUCKETS - 1); tokens[b] = (tokens[b] || 0) + 1; nTokens++; }
      if (bigrams) for (let i = 0; i + 1 < list.length; i++) {
        const b = fnv1a(prefix + list[i] + '_' + list[i + 1]) & (PAGE_BUCKETS - 1); tokens[b] = (tokens[b] || 0) + 1;
      }
    }
    const q = (sel) => Array.from(doc.querySelectorAll(sel));
    const attr = (el, a) => (el.getAttribute ? el.getAttribute(a) : null) || '';

    // --- token sources ---
    const ogTitle = q('meta[property="og:title"],meta[property="og:site_name"]').map((m) => attr(m, 'content')).join(' ');
    add('t:', tokenize((doc.title || '') + ' ' + ogTitle), 40, true);
    add('m:', tokenize(q('meta[name="description"]').map((m) => attr(m, 'content')).join(' ')), 40, false);
    add('h:', tokenize(q('h1,h2,h3').map(text).join(' ')), 60, false);
    const bodyText = _bodyText(doc);
    const bodyToks = tokenize(bodyText);
    add('b:', bodyToks, 1500, false);
    const inputs = q('input,textarea,select');
    const inputWords = inputs.map((i) => [attr(i, 'name'), attr(i, 'placeholder'), attr(i, 'aria-label'), attr(i, 'autocomplete')].join(' '))
      .concat(q('label').map(text)).join(' ');
    add('i:', tokenize(inputWords), 80, false);
    add('btn:', tokenize(q('button,input[type="submit"],input[type="button"],a[role="button"]')
      .map((b) => text(b) + ' ' + attr(b, 'value')).join(' ')), 30, true);
    const anchors = q('a');
    add('a:', tokenize(anchors.map(text).join(' ')), 120, false);
    const forms = q('form');
    for (const f of forms) {
      let same = true;
      const action = attr(f, 'action');
      if (action && /^https?:\/\//i.test(action)) {
        try { same = C.registrableDomain(new URL(action).hostname.toLowerCase()) === pageDomain; }
        // An absolute-looking form action that fails to parse as a URL is the more
        // suspicious case (a broken/obfuscated submission target) -- treat as FOREIGN,
        // unlike anchor hrefs where parse failure also counts as external (kept consistent).
        catch (_) { same = false; }
      }
      add('f:', [same ? 'same' : 'foreign', (attr(f, 'method') || 'get').toLowerCase()], 2, false);
    }

    // --- dense structural features ---
    const nLinks = anchors.length;
    let ext = 0, dead = 0, sameHost = 0;
    for (const a of anchors) {
      const h = attr(a, 'href').trim();
      if (!h || h === '#' || /^javascript:/i.test(h)) { dead++; continue; }
      if (/^https?:\/\//i.test(h)) {
        try { if (C.registrableDomain(new URL(h).hostname.toLowerCase()) === pageDomain) sameHost++; else ext++; }
        catch (_) { ext++; }
      } else sameHost++;
    }
    const inputsAll = q('input');
    const nPassword = inputsAll.filter((i) => attr(i, 'type').toLowerCase() === 'password').length;
    const nHidden = inputsAll.filter((i) => attr(i, 'type').toLowerCase() === 'hidden').length;
    const loginWords = tokenize(inputWords).some((t) => LOGIN_WORDS.includes(t)) ? 1 : 0;
    const html = doc.documentElement;
    const dense = [
      clamp01(forms.length / 5), clamp01(inputsAll.length / 20), clamp01(nPassword / 3), clamp01(nHidden / 10),
      clamp01(nLinks / 200), nLinks ? ext / nLinks : 0, nLinks ? dead / nLinks : 0, nLinks ? sameHost / nLinks : 0,
      clamp01(q('iframe').length / 5), clamp01(q('img').length / 50), clamp01(q('script').length / 30),
      clamp01(Math.log1p(bodyText.length) / 10),
      q('nav,header,footer').length ? 1 : 0,
      html && attr(html, 'lang') ? 1 : 0,
      q('link[rel~="icon"],link[rel="apple-touch-icon"]').length ? 1 : 0,
      loginWords
    ];
    return { tokens, dense, meta: { nTokens } };
  }

  return { extractPageFeatures, fnv1a, tokenize, PAGE_BUCKETS, PAGE_DENSE_NAMES, _bodyText };
});
