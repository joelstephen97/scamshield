// ui/footer.js — rotating popup footer slot (0.8.0).
//
// Pure rotation logic for the popup's one footer slot (Privacy Badger's
// rotating-footer pattern): when the review ask isn't showing, the slot
// alternates between the on-device trust line and the support link, one
// variant per popup open. Which variant a given open shows is persisted by
// popup.js (storage.local `footerVariant`); this module only answers "given
// what was shown last time, what shows now?" — so it stays require()-able
// from Node tests with no chrome.* in sight.
//
// UMD like the engine/ui modules: loadable as a <script> from popup.html and
// require()-able from Node tests.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSFooter = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Rotation order for the non-review variants. 'review' is never part of the
  // rotation: the review ask preempts the slot only while ui/review.js says
  // it's earned, and the rotation resumes underneath as if it weren't there.
  const ROTATION = ['trust', 'support'];

  // stored → the variant to show on THIS open. A fresh install (undefined/
  // null/''), or a stray value from a downgrade/corruption, resets to the
  // first slot rather than throwing or sticking.
  function nextVariant(stored) {
    const i = ROTATION.indexOf(stored);
    return i === -1 ? ROTATION[0] : ROTATION[(i + 1) % ROTATION.length];
  }

  return { ROTATION, nextVariant };
});
