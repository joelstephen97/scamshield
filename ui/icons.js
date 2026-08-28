// ui/icons.js — inline SVG (currentColor) so every surface uses the same marks.
(function (root) {
  'use strict';
  const S = (inner, size) => `<svg class="ic${size === 'sm' ? ' sm' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5l8-3z"/>${inner}</svg>`;
  const shields = {
    safe: '<path d="M8.5 12.5l2.5 2.5 4.5-5"/>', suspicious: '<path d="M12 8v5"/><path d="M12 16h.01"/>',
    dangerous: '<path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>', unknown: '<path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 2-2.2 3.2"/><path d="M12 16.5h.01"/>'
  };
  root.SSIcons = {
    shield: (level, size) => S(shields[level] || shields.unknown, size),
    gear: () => '<svg class="ic sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    lock: () => '<svg class="ic sm" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    chevron: (up) => `<svg class="ic sm" viewBox="0 0 24 24" aria-hidden="true"><path d="${up ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}"/></svg>`,
    // Popup header language switcher (0.7.1) — a globe, matching the gear's
    // stroke style/size so the two header icons read as one family.
    globe: () => '<svg class="ic sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z"/></svg>'
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
