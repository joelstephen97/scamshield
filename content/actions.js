(function (root) {
  'use strict';
  const NS = 'scamshield';
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function clearAll() {
    document.querySelectorAll('.' + NS + '-banner, .' + NS + '-overlay').forEach((n) => n.remove());
    document.querySelectorAll('.' + NS + '-hidden-block').forEach((n) => {
      n.classList.remove(NS + '-hidden-block');
      const t = n.querySelector('.' + NS + '-hidden-tag'); if (t) t.remove();
    });
  }

  const SHIELD = (inner) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5l8-3z"/>' + inner + '</svg>';
  const ICON = { dangerous: SHIELD('<path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'), suspicious: SHIELD('<path d="M12 8v5"/><path d="M12 16h.01"/>') };
  function showBanner(verdict, onAllow, extra) {
    if (document.querySelector('.' + NS + '-banner')) return;
    const x = extra || {};
    const danger = verdict.level === 'dangerous';
    const bar = el('div', NS + '-banner ' + (danger ? 'danger' : 'suspicious'));
    bar.setAttribute('role', 'alert');
    const ico = el('span', 'ss-ico'); ico.innerHTML = ICON[danger ? 'dangerous' : 'suspicious'];
    const text = el('div', 'ss-text');
    const brand = verdict.brandLabel ? ' — looks like ' + verdict.brandLabel + ", but isn't" : '';
    text.append(el('b', null, (danger ? 'Dangerous page' : 'Suspicious page') + brand), el('span', null, verdict.reasons[0] || (danger ? "Don't enter passwords or card details here." : 'Take care before typing anything here.')));
    const acts = el('div', 'ss-acts');
    if (danger) { const leave = el('button', 'ss-leave', 'Leave this page'); leave.addEventListener('click', () => { x.onLeave ? x.onLeave() : history.back(); }); acts.appendChild(leave); }
    if (verdict.brandUrl) { const rescue = el('button', 'ss-rescue', 'Take me to the real ' + (verdict.brandLabel || 'site')); rescue.addEventListener('click', () => { location.href = verdict.brandUrl; }); acts.appendChild(rescue); }
    if (!danger) { const why = el('button', 'ss-why', 'Show why'); why.addEventListener('click', () => { text.querySelector('span').textContent = verdict.reasons.slice(0, 3).join(' · '); why.remove(); }); acts.appendChild(why); }
    const trust = el('button', 'ss-trust', 'Trust this site'); trust.addEventListener('click', () => { onAllow && onAllow(); bar.remove(); });
    const report = el('button', 'ss-report', 'Report a mistake'); report.addEventListener('click', () => { report.textContent = 'Thanks'; report.disabled = true; x.onReport && x.onReport(); });
    const close = el('button', 'ss-x', '✕'); close.setAttribute('aria-label', 'Dismiss'); close.addEventListener('click', () => bar.remove());
    acts.append(trust, report, close);
    bar.append(ico, text, acts);
    (document.body || document.documentElement).appendChild(bar);
  }

  // One-time-ever, shown only right after a dangerous page was blocked.
  function supportToast() {
    if (document.querySelector('.' + NS + '-toast')) return;
    const t = el('div', NS + '-toast warn');
    t.setAttribute('role', 'status');
    const a = el('a', null, 'ScamShield just protected you — it’s free and runs on your device. Chip in? ❤');
    a.href = 'https://github.com/sponsors/joelstephen97';
    a.target = '_blank'; a.rel = 'noopener';
    const x = el('button', null, 'Dismiss'); x.addEventListener('click', () => t.remove());
    t.append(a, x); (document.body || document.documentElement).appendChild(t);
    setTimeout(() => t.remove(), 20000);
  }

  // Intercept submit on password forms that post off-domain.
  // NOTE: capture-phase 'submit' catches user-initiated submits (click, Enter,
  // requestSubmit) — the path credential phishing relies on. It does NOT catch
  // programmatic HTMLFormElement.submit(), which bypasses event listeners and
  // would require a MAIN-world injected hook (deferred to a later version).
  function guardForms(foreignForms, reasons, onReport) {
    foreignForms.forEach((form) => {
      if (form.__scamshieldGuarded) return;
      form.__scamshieldGuarded = true;
      const onSubmit = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (document.querySelector('.' + NS + '-overlay')) return;
        const ov = el('div', NS + '-overlay');
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Possible phishing warning');
        const card = el('div', 'ss-card');
        card.append(
          el('h3', null, 'Stop — possible phishing'),
          el('p', null, 'This form sends your password to a different website than the one you are visiting. This is a common way scammers steal logins.')
        );
        const ul = el('ul', 'ss-evidence');
        for (const r of (reasons || []).slice(0, 3)) { const li = el('li'); li.append(el('span', 'ss-chip', 'Page'), el('span', null, r)); ul.appendChild(li); }
        card.appendChild(ul);
        const actions = el('div', 'ss-actions');
        const back = el('button', null, 'Cancel (recommended)');
        const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        back.addEventListener('click', close);
        const go = el('button', null, 'Submit anyway');
        // form.submit() here runs the isolated world's native (unhooked) method,
        // so it really submits without re-triggering this guard.
        go.addEventListener('click', () => { document.removeEventListener('keydown', onKey, true); ov.remove(); form.submit(); });
        actions.append(back, go);
        const rep = el('button', 'ss-report', 'Report a mistake'); rep.addEventListener('click', () => { rep.textContent = 'Thanks'; rep.disabled = true; onReport && onReport(); }); actions.prepend(rep);
        card.append(actions); ov.append(card);
        document.documentElement.appendChild(ov);
        document.addEventListener('keydown', onKey, true);
        back.focus();
      };
      form.addEventListener('submit', onSubmit, true);
      form.addEventListener('scamshield:formsubmit', onSubmit, true);
    });
  }

  function hideScamBlocks(blocks) {
    blocks.forEach((node) => {
      if (node.classList.contains(NS + '-hidden-block')) return;
      node.classList.add(NS + '-hidden-block');
      const tag = el('div', NS + '-hidden-tag', 'Hidden by ScamShield');
      node.appendChild(tag);
    });
  }

  function walletConfirmOverlay(detail, onDecision) {
    if (document.querySelector('.' + NS + '-overlay')) {
      // Another warning is already on screen. Deny, never silently approve —
      // a drainer could fire a decoy request first and slip the real one
      // through the collision path. The dApp receives a standard user-rejected
      // error (4001) and can simply retry. collision:true tells the bridge
      // this denial is synthetic, not a user-confirmed threat.
      const t = el('div', NS + '-toast warn');
      t.setAttribute('role', 'alert');
      t.append(el('span', null, '🛡️ '), el('span', 'ss-msg',
        'ScamShield blocked a wallet request while another warning was open. Close it and retry.'));
      (document.body || document.documentElement).appendChild(t);
      setTimeout(() => t.remove(), 12000);
      onDecision(false, { collision: true });
      return;
    }
    const ov = el('div', NS + '-overlay');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Risky wallet request');
    const card = el('div', 'ss-card');
    card.append(el('h3', null, '⚠️ Risky wallet request'),
      el('p', null, (detail.reasons && detail.reasons[0]) || 'This site is requesting a sensitive wallet action.'),
      el('p', 'ss-sub', 'If you did not expect this, cancel. Drainers use these requests to steal your crypto.'));
    const actions = el('div', 'ss-actions');
    const cancel = el('button', null, 'Cancel (recommended)');
    const proceed = el('button', null, 'Proceed anyway');
    const done = (allow) => { document.removeEventListener('keydown', onKey, true); ov.remove(); onDecision(allow); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
    cancel.addEventListener('click', () => done(false));
    proceed.addEventListener('click', () => done(true));
    actions.append(cancel, proceed); card.append(actions); ov.append(card);
    document.documentElement.appendChild(ov);
    document.addEventListener('keydown', onKey, true); cancel.focus();
  }

  function clipboardToast(detail) {
    const old = document.querySelector('.' + NS + '-toast'); if (old) old.remove();
    const t = el('div', NS + '-toast ' + (detail.level === 'dangerous' ? 'danger' : 'warn'));
    t.setAttribute('role', 'alert');
    t.append(el('span', null, '📋 '), el('span', 'ss-msg', (detail.reasons && detail.reasons[0]) || 'A site changed your clipboard.'));
    const x = el('button', null, 'Dismiss'); x.addEventListener('click', () => t.remove());
    t.append(x); (document.body || document.documentElement).appendChild(t);
    setTimeout(() => t.remove(), 12000);
  }

  function techScamEscapeOverlay(verdict, onLeave) {
    if (document.querySelector('.' + NS + '-overlay')) return;
    const ov = el('div', NS + '-overlay');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Possible tech-support scam');
    const card = el('div', 'ss-card');
    card.append(el('h3', null, '⛔ Possible tech-support scam'),
      el('p', null, (verdict.reasons && verdict.reasons[0]) || 'This page is using scare tactics.'),
      el('p', 'ss-sub', 'Real companies never lock your screen or demand you call a number. Do not call, and do not pay.'));
    const actions = el('div', 'ss-actions');
    const leave = el('button', null, 'Get me out (close this page)');
    const stay = el('button', null, 'Dismiss');
    const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    leave.addEventListener('click', () => { close(); onLeave && onLeave(); });
    stay.addEventListener('click', close);
    actions.append(leave, stay); card.append(actions); ov.append(card);
    document.documentElement.appendChild(ov);
    document.addEventListener('keydown', onKey, true); leave.focus();
  }

  root.ScamShield = root.ScamShield || {};
  root.ScamShield.actions = { showBanner, guardForms, hideScamBlocks, clearAll, walletConfirmOverlay, clipboardToast, techScamEscapeOverlay, supportToast };
})(typeof globalThis !== 'undefined' ? globalThis : self);
