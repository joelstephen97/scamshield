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

  function showBanner(verdict, onAllow) {
    if (document.querySelector('.' + NS + '-banner')) return;
    const bar = el('div', NS + '-banner ' + (verdict.level === 'dangerous' ? 'danger' : 'suspicious'));
    bar.setAttribute('role', 'alert');
    const icon = el('span', null, verdict.level === 'dangerous' ? '⛔' : '⚠️');
    const msg = el('span', 'ss-msg',
      (verdict.level === 'dangerous' ? 'Warning: this page looks dangerous. ' : 'Caution: this page looks suspicious. ')
      + (verdict.reasons[0] || ''));
    const trust = el('button', null, 'Trust this site');
    trust.addEventListener('click', () => { onAllow && onAllow(); bar.remove(); });
    const close = el('button', null, 'Dismiss');
    close.addEventListener('click', () => bar.remove());
    bar.append(icon, msg, trust, close);
    (document.body || document.documentElement).appendChild(bar);
  }

  // Intercept submit on password forms that post off-domain.
  // NOTE: capture-phase 'submit' catches user-initiated submits (click, Enter,
  // requestSubmit) — the path credential phishing relies on. It does NOT catch
  // programmatic HTMLFormElement.submit(), which bypasses event listeners and
  // would require a MAIN-world injected hook (deferred to a later version).
  function guardForms(foreignForms) {
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
        const actions = el('div', 'ss-actions');
        const back = el('button', null, 'Cancel (recommended)');
        const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        back.addEventListener('click', close);
        const go = el('button', null, 'Submit anyway');
        // form.submit() here runs the isolated world's native (unhooked) method,
        // so it really submits without re-triggering this guard.
        go.addEventListener('click', () => { document.removeEventListener('keydown', onKey, true); ov.remove(); form.submit(); });
        actions.append(back, go); card.append(actions); ov.append(card);
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
    if (document.querySelector('.' + NS + '-overlay')) { onDecision(true); return; }
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
  root.ScamShield.actions = { showBanner, guardForms, hideScamBlocks, clearAll, walletConfirmOverlay, clipboardToast, techScamEscapeOverlay };
})(typeof globalThis !== 'undefined' ? globalThis : self);
