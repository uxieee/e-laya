/* elaya-shell.js — an out-of-fiction reviewer bar.
 *
 * Deliberately NOT in-fiction navigation. The kiosk is a terminal bolted to a
 * jail wall; a control offering "switch to PAO caseload" would be a lie about
 * the product. So this is visibly a review aid: dark, fixed, labelled, and
 * removable with ?bare=1 for filming and screenshots.
 *
 * Dismissing it must never be a one-way door. This bar is the only navigation
 * on the site — no surface links to another — so a reviewer who taps × and
 * cannot get it back is stranded with nothing but the address bar. Three
 * independent ways back, none of them requiring devtools:
 *
 *   1. ?bare=0 (or ?shell=1) on any surface clears the dismissal — the ×
 *      button names it in its tooltip, so it is discoverable in-page;
 *   2. the dismissal lives in sessionStorage, so it dies with the tab rather
 *      than with the browser profile — reopening the site brings it back;
 *   3. "Reset demo" clears it too, for the case where it is already showing
 *      in one tab and stuck hidden in another.
 */
(function () {
  'use strict';

  var HIDDEN_KEY = 'elaya.shell.hidden';

  /* sessionStorage, not localStorage: a dismissal should outlive navigation
   * (that is the whole point) but not the browsing session. */
  function store() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  var SURFACES = [
    { href: 'index.html',    label: 'Home' },
    { href: 'kiosk.html',    label: 'Kiosk' },
    { href: 'app.html',      label: 'Family' },
    { href: 'cases.html',    label: 'Cases' },
    { href: 'sessions.html', label: 'Sessions' },
    { href: 'verify.html',   label: 'Verify' },
    { href: 'custody.html',  label: 'Custody' }
  ];

  function hidden() {
    try { var s = store(); return !!s && s.getItem(HIDDEN_KEY) === '1'; } catch (e) { return false; }
  }

  /* Undo a dismissal. Must not throw with storage blocked — a reviewer who
   * cannot reach the bar is the failure this whole path exists to prevent. */
  function unhide() {
    try { var s = store(); if (s) s.removeItem(HIDDEN_KEY); } catch (e) { /* ignore */ }
    // Older builds persisted this in localStorage; clear that too so a
    // dismissal made before this fix is recoverable by the same route.
    try { localStorage.removeItem(HIDDEN_KEY); } catch (e) { /* ignore */ }
  }

  /* -------------------------------------------------------- space reserve
   * The bar is position:fixed, so it covers whatever is underneath it
   * unless we reserve room.
   *
   * kiosk.html is a fixed, non-scrolling simulated touchscreen
   * (html,body{overflow:hidden}, around line 42) with a tuned internal
   * flex layout — reserving space there would either be clipped or
   * perturb #kbody's flex sizing. That is feature-detected out below
   * (scrollableTop() is false) rather than hardcoded by filename.
   *
   * app.html/cases.html/sessions.html/verify.html/custody.html don't set
   * overflow:hidden on html/body, but at narrow widths they render inside
   * a `.phone` device-frame div (elaya.css, @media max-width:480px) that
   * itself becomes height:100dvh; overflow:hidden — a second, inner
   * "viewport" that body-level padding cannot reach (body never actually
   * overflows there, so padding on it is inert — verified by checking
   * whether it actually grows document.documentElement.scrollHeight).
   * Inside that frame, pinned-bottom content is laid out two different
   * ways — a flex `flex:none` footer (app.html/custody.html's `.foot`)
   * that responds to the frame's content-box height, and an absolutely
   * positioned `bottom:0` tab bar (cases.html/sessions.html's `.tabs`)
   * that is anchored to the frame's border box and does NOT respond to
   * padding at all. Shrinking the frame's own `height` (rather than
   * padding it) moves both, since it moves the border edge itself. So:
   * try body first (feature-detected + verified); if that's inert, find
   * that kind of full-viewport self-clipping frame and shrink its height
   * instead. Either way the original inline value is restored on hide.
   */
  var bodyPad = null;   // { prevInline, base } while we've padded <body>
  var framePad = null;  // { el, prevInline, base } while we've shrunk a device frame's height

  function scrollableTop() {
    try {
      var docOv = getComputedStyle(document.documentElement).overflowY;
      var bodyOv = getComputedStyle(document.body).overflowY;
      return docOv !== 'hidden' && bodyOv !== 'hidden';
    } catch (e) {
      return false; // can't tell — safest is to not touch layout
    }
  }

  /* A full-viewport element that clips its own overflow acts as a second,
   * inner "device screen" — e.g. .phone at mobile widths. Feature-detect
   * it generically (size + overflow) rather than hardcoding the class. */
  function findFrame() {
    try {
      var all = document.body.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cs = getComputedStyle(el);
        if (cs.overflowY !== 'hidden' && cs.overflow !== 'hidden') continue;
        var r = el.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.95 &&
            r.height >= window.innerHeight * 0.9 &&
            r.top <= 4 && r.top >= -4) {
          return el;
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function applyReserve(nav) {
    try {
      var barHeight = nav.getBoundingClientRect().height;
      if (!barHeight) return;
      // Surfaces that declare html/body{overflow:hidden} (kiosk.html) are
      // opting out of scroll entirely by design — leave them untouched.
      if (!scrollableTop()) return;

      if (bodyPad === null) {
        var beforeScroll = document.documentElement.scrollHeight;
        var prevInline = document.body.style.paddingBottom;
        var base = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
        document.body.style.paddingBottom = (base + barHeight) + 'px';
        // Confirm body padding actually created scroll room. If the page's
        // true content lives inside an inner clipped frame (see above),
        // body was already exactly viewport-height and padding is inert —
        // revert and fall back to the frame instead.
        if (document.documentElement.scrollHeight > beforeScroll) {
          bodyPad = { prevInline: prevInline, base: base };
        } else {
          document.body.style.paddingBottom = prevInline;
        }
      } else {
        document.body.style.paddingBottom = (bodyPad.base + barHeight) + 'px';
      }

      if (bodyPad === null) {
        var frame = (framePad && framePad.el) || findFrame();
        if (frame) {
          if (!framePad || framePad.el !== frame) {
            framePad = {
              el: frame,
              prevInline: frame.style.height,
              prevAlignSelf: frame.style.alignSelf,
              base: frame.getBoundingClientRect().height
            };
            // The frame's own parent may center it (e.g. .phone-wrap's
            // align-items:center), which would otherwise donate half of
            // the height we free up to empty space ABOVE the frame instead
            // of reserving it below. Pin the frame to the start of its
            // flex parent's cross axis so the full amount lands at the
            // bottom, where the bar is. A no-op if the parent isn't flex.
            frame.style.alignSelf = 'flex-start';
          }
          frame.style.height = (framePad.base - barHeight) + 'px';
        }
      }
    } catch (e) { /* ignore */ }
  }

  function restoreReserve() {
    try {
      if (bodyPad !== null) document.body.style.paddingBottom = bodyPad.prevInline;
    } catch (e) { /* ignore */ }
    try {
      if (framePad !== null) {
        framePad.el.style.height = framePad.prevInline;
        framePad.el.style.alignSelf = framePad.prevAlignSelf;
      }
    } catch (e) { /* ignore */ }
    bodyPad = null;
    framePad = null;
  }

  function onResize() {
    var nav = document.getElementById('elaya-shell');
    if (nav) applyReserve(nav);
  }

  function hide() {
    try { var s = store(); if (s) s.setItem(HIDDEN_KEY, '1'); } catch (e) { /* ignore */ }
    var el = document.getElementById('elaya-shell');
    if (el) el.remove();
    try { window.removeEventListener('resize', onResize); } catch (e) { /* ignore */ }
    restoreReserve();
  }

  function build() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    var bare = q && q.get('bare');
    // Recovery first, so ?bare=0 works on the very surface the bar was hidden on.
    if (bare === '0' || (q && q.get('shell') === '1')) unhide();
    if (bare === '1') return;
    if (hidden()) return;
    if (document.getElementById('elaya-shell')) return;

    var here = (location.pathname.split('/').pop() || 'index.html');

    var css = document.createElement('style');
    css.textContent =
      '#elaya-shell{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
      'display:flex;align-items:center;gap:4px;flex-wrap:wrap;' +
      'background:#0b1020;border-top:1px solid #263154;padding:6px 10px;' +
      'font:500 12px/1 ui-sans-serif,system-ui,-apple-system,sans-serif}' +
      '#elaya-shell .tag{color:#7b89b8;letter-spacing:.12em;text-transform:uppercase;' +
      'font-size:9.5px;margin-right:6px;white-space:nowrap}' +
      '#elaya-shell a{color:#c8d3f5;text-decoration:none;padding:9px 11px;border-radius:6px;' +
      'white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;' +
      'min-height:32px;box-sizing:border-box}' +
      '#elaya-shell a:hover{background:#1b2440}' +
      '#elaya-shell a[aria-current=page]{background:#0040E7;color:#fff}' +
      '#elaya-shell .sp{flex:1 1 auto}' +
      '#elaya-shell button{background:none;border:1px solid #263154;color:#7b89b8;' +
      'border-radius:6px;padding:9px 11px;cursor:pointer;font:inherit;white-space:nowrap;' +
      'display:inline-flex;align-items:center;justify-content:center;' +
      'min-height:32px;min-width:32px;box-sizing:border-box}' +
      '#elaya-shell button:hover{color:#c8d3f5;border-color:#3a4a78}' +
      '@media print{#elaya-shell{display:none}}';
    document.head.appendChild(css);

    var nav = document.createElement('nav');
    nav.id = 'elaya-shell';
    nav.setAttribute('aria-label', 'e-Laya reviewer navigation');

    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'Review';
    nav.appendChild(tag);

    SURFACES.forEach(function (s) {
      var a = document.createElement('a');
      a.href = s.href;
      a.textContent = s.label;
      if (s.href === here) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });

    var sp = document.createElement('span');
    sp.className = 'sp';
    nav.appendChild(sp);

    if (window.Elaya && window.Elaya.persistent === false) {
      var warn = document.createElement('span');
      warn.className = 'tag';
      warn.textContent = 'Not saving';
      nav.appendChild(warn);
    }

    var reset = document.createElement('button');
    reset.setAttribute('data-act', 'reset');
    reset.textContent = 'Reset demo';
    reset.addEventListener('click', function () {
      unhide();
      if (window.Elaya) window.Elaya.reset();
      location.reload();
    });
    nav.appendChild(reset);

    var close = document.createElement('button');
    close.setAttribute('data-act', 'hide');
    close.setAttribute('aria-label', 'Hide reviewer bar — add ?bare=0 to any address to bring it back');
    close.setAttribute('title', 'Hide the reviewer bar. Add ?bare=0 to any address to bring it back.');
    close.textContent = '×';
    close.addEventListener('click', hide);
    nav.appendChild(close);

    document.body.appendChild(nav);
    applyReserve(nav);
    window.addEventListener('resize', onResize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
