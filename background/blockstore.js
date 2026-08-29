// background/blockstore.js — IndexedDB persistence for the v0.9 threat-feed
// typed arrays (Task B2).
//
// Unlike engine/blockset.js (chrome-free, crypto-free, Node-testable), this
// module is browser/SW-only: it talks to the real `indexedDB` global, which
// Node does not provide. It is validated by the e2e suite (real Chromium
// IndexedDB via Playwright) rather than by `node --test`.
//
// Schema: database 'parry', object store 'blockset', one record keyed
// 'feed' holding { version, blockBuf, warnBuf, warnUpdatedAt }. The two
// ArrayBuffers persist via IndexedDB's structured clone — no 10MB
// storage.local cap, and no JSON-stringify inflation of a multi-MB binary
// blob the way storage.local would force.
//
// Module-level cache + ready-promise gate: init() is called once at SW
// script-evaluation time (mirrors settingsInitPromise/installedAtPromise in
// service_worker.js) so a wake-up message handler can `await ready()` and
// never race the IndexedDB read that follows an SW eviction.
//
// UMD like the engine modules, but the factory returns `null` under Node
// (no `indexedDB` global) rather than throwing at load time — so requiring
// this file from a Node test harness that merely wants to assert on its
// shape does not blow up; every real operation is guarded and only ever
// runs where `indexedDB` exists.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Blockstore = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Kept as 'parry' although the product rename was reverted: 0.9.0 builds
  // already persist their blockset under this database name, and renaming it
  // would orphan those caches for nothing — it is invisible to users.
  const DB_NAME = 'parry';
  const STORE_NAME = 'blockset';
  const DB_VERSION = 1;
  const RECORD_KEY = 'feed';

  function hasIndexedDB() { return typeof indexedDB !== 'undefined' && indexedDB; }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }

  async function idbPut(key, value) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }

  // Module-scoped state, shared by every caller in this SW lifetime.
  let cache = null;   // { version, blockBuf, warnBuf, warnUpdatedAt } | null
  let readyPromise = null;

  async function rehydrate() {
    if (!hasIndexedDB()) { cache = null; return cache; }
    try {
      const rec = await idbGet(RECORD_KEY);
      cache = rec || null;
    } catch (_) { cache = null; /* best-effort — a fresh OTA cycle will repopulate */ }
    return cache;
  }

  // Kicks off (once) or returns the in-flight/completed rehydrate promise.
  // Every reader/writer below awaits this before touching `cache`.
  function ready() {
    if (!readyPromise) readyPromise = rehydrate();
    return readyPromise;
  }

  // Current { version, blockBuf, warnBuf, warnUpdatedAt } or null if nothing
  // has ever been persisted (fresh install, before the first OTA cycle).
  async function get() {
    await ready();
    return cache;
  }

  // Persists a full replacement record (structured-clone ArrayBuffers) and
  // updates the in-memory cache so a subsequent get() in the same SW
  // lifetime never re-reads IndexedDB.
  async function save(next) {
    await ready();
    if (hasIndexedDB()) await idbPut(RECORD_KEY, next);
    cache = next;
    readyPromise = Promise.resolve(next);
    return next;
  }

  // Test/debug hook: drops the persisted record and resets the in-memory
  // cache + ready gate so the next get() re-derives from (now-empty) storage.
  async function clear() {
    if (hasIndexedDB()) { try { await idbPut(RECORD_KEY, null); } catch (_) {} }
    cache = null;
    readyPromise = Promise.resolve(null);
  }

  return { DB_NAME, STORE_NAME, RECORD_KEY, hasIndexedDB, ready, get, save, clear };
});
