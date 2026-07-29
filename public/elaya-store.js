/* elaya-store.js — canonical cross-surface state for e-Laya.
 *
 * Classic script, not a module: surfaces use inline non-module <script> and
 * must keep working from file://. Load this BEFORE a surface's inline script.
 *
 * Contract: this is an enhancement layer. Every call is total — it logs once
 * and returns the caller's fallback rather than throwing into a surface. A
 * surface with the store absent must still render from its own seed data.
 */
(function () {
  'use strict';

  var KEY = 'elaya.v1';
  var VERSION = 1;

  var state = null;
  var readyQueue = [];
  var complained = false;

  var api = {
    persistent: true,
    degraded: false
  };

  function warn(err) {
    if (complained) return;
    complained = true;
    api.degraded = true;
    if (window.console && console.warn) console.warn('[elaya-store] degraded:', err);
  }

  /* ---------- storage, defensively ---------- */

  function storage() {
    try {
      var ls = window.localStorage;
      ls.setItem(KEY + '.probe', '1');
      ls.removeItem(KEY + '.probe');
      return ls;
    } catch (e) {
      api.persistent = false;
      return null;
    }
  }

  function seed() {
    return {
      version: VERSION,
      seededAt: '2026-07-29T00:00:00+08:00',
      people: (window.ELAYA_CAST && window.ELAYA_CAST.people) || {},
      welfare: {},
      attendance: {},
      determinations: {},
      notifications: [],
      updatedAt: null
    };
  }

  // Later sources win, key by key. Own enumerable keys only, so nothing
  // reachable through a prototype can be folded in here either.
  function merge(a, b) {
    var out = {}, k;
    for (k in (a || {})) if (Object.prototype.hasOwnProperty.call(a, k) && !isUnsafe(k)) out[k] = a[k];
    for (k in (b || {})) if (Object.prototype.hasOwnProperty.call(b, k) && !isUnsafe(k)) out[k] = b[k];
    return out;
  }

  function load() {
    var ls = storage();
    if (!ls) return seed();
    try {
      var raw = ls.getItem(KEY);
      if (!raw) return seed();
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return seed();
      // Re-attach the cast: it lives in code, not in storage, so edits to
      // elaya-cast.js take effect without anyone clearing their browser.
      //
      // MERGE, do not replace. A /verify determination writes a person that
      // exists nowhere in code (that is the whole point of it — an unnamed
      // person entering the record), and a straight replacement erased every
      // such person on the next page load. The cast still wins on its own
      // ids, so the original intent holds.
      parsed.people = merge(parsed.people, (window.ELAYA_CAST && window.ELAYA_CAST.people) || {});
      return parsed;
    } catch (e) {
      return seed();   // corrupt blob: discard, do not surface an error
    }
  }

  function save() {
    var ls = storage();
    if (!ls) return;
    try {
      state.updatedAt = new Date().toISOString();
      ls.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      warn(e);         // quota or serialisation failure: keep running in memory
    }
  }

  /* ---------- dot-path access ---------- */

  function walk(path) {
    return String(path).split('.').filter(Boolean);
  }

  // Segments that would let a dot-path reach onto Object.prototype (or a
  // constructor) and corrupt every plain object on the page. Rejected
  // outright: get/set treat such a path as unreachable, never as an error.
  function isUnsafe(key) {
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
  }

  api.get = function (path, fallback) {
    try {
      var node = state;
      var parts = walk(path);
      for (var i = 0; i < parts.length; i++) {
        if (isUnsafe(parts[i])) return fallback;
        if (node == null || typeof node !== 'object') return fallback;
        node = node[parts[i]];
      }
      return node === undefined ? fallback : node;
    } catch (e) {
      warn(e);
      return fallback;
    }
  };

  api.set = function (path, value) {
    try {
      var parts = walk(path);
      var last = parts.pop();
      if (isUnsafe(last)) return value;
      var node = state;
      for (var i = 0; i < parts.length; i++) {
        if (isUnsafe(parts[i])) return value;
        if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[last] = value;
      save();
      api.emit('change', { path: path, value: value });
      return value;
    } catch (e) {
      warn(e);
      return value;
    }
  };

  api.update = function (path, fn) {
    // fn is caller-supplied and may throw; api.set's own try/catch never
    // runs in that case because fn(...) is evaluated before set is called.
    // Guard here so a throwing mutator degrades instead of propagating.
    try {
      var next = fn(api.get(path));
      return api.set(path, next);
    } catch (e) {
      warn(e);
      return api.get(path);
    }
  };

  api.reset = function () {
    try {
      var ls = storage();
      if (ls) ls.removeItem(KEY);
    } catch (e) { /* ignore */ }
    state = seed();
    save();
    api.emit('change', { path: '*', value: null });
  };

  /* ---------- events ---------- */

  var handlers = {};

  api.on = function (event, handler) {
    (handlers[event] || (handlers[event] = [])).push(handler);
    return handler;
  };

  api.off = function (event, handler) {
    var list = handlers[event];
    if (!list) return;
    var i = list.indexOf(handler);
    if (i > -1) list.splice(i, 1);
  };

  api.emit = function (event, payload) {
    var list = (handlers[event] || []).slice();
    for (var i = 0; i < list.length; i++) {
      // One bad subscriber must never stop the others, or block a save.
      try { list[i](payload); } catch (e) { warn(e); }
    }
  };

  api.notify = function (n) {
    try {
      // n is caller-supplied and may be missing, null, or not an object;
      // normalise it rather than dereferencing straight into a throw.
      if (!n || typeof n !== 'object') n = {};
      var rec = {
        id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        to: n.to || '',
        body: n.body || '',
        surface: n.surface || '',
        personId: n.personId || null,
        at: new Date().toISOString()
      };
      var list = api.get('notifications', []);
      list.unshift(rec);
      api.set('notifications', list);
      api.emit('notification', rec);
      return rec;
    } catch (e) {
      warn(e);
      return {
        id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        to: '', body: '', surface: '', personId: null,
        at: new Date().toISOString()
      };
    }
  };

  api.ready = function (fn) {
    if (state) { try { fn(api); } catch (e) { warn(e); } }
    else readyQueue.push(fn);
  };

  /* ---------- boot ---------- */

  state = load();
  save();
  while (readyQueue.length) api.ready(readyQueue.shift());

  /* ---------- cross-tab sync ----------
     Another tab wrote to localStorage. Re-hydrate and tell this tab's
     subscribers, so /custody and /app open side by side track each other. */
  try {
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY) return;
      state = load();
      api.emit('change', { path: '*', value: null, remote: true });
    });
  } catch (e) {
    warn(e);
  }

  window.Elaya = api;
})();
