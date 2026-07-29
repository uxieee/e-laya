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
   * unless the page reserves room for it. Doing that from JavaScript by
   * poking at whichever box happens to be the "real" viewport on each
   * surface does not work, because the seven surfaces use three different
   * layout regimes and none of them responds to padding on <body>:
   *
   *   - elaya.css sets html,body{height:100%}. body is therefore a
   *     fixed-height box, and padding-bottom on a fixed-height box does
   *     NOT extend the scrollable area past overflowing content. So the
   *     body-padding approach is inert on index.html.
   *   - app/cases/sessions/verify/custody render inside a `.phone` device
   *     frame — 390x844 and centred by `.phone-wrap` above 480px, and
   *     100%/100dvh below it. Either way it clips its own overflow, so it
   *     is a second, inner viewport that body padding cannot reach.
   *   - kiosk.html is a 1080x1920 #stage CSS-scaled to fit, on a
   *     deliberately non-scrolling html,body{overflow:hidden} page.
   *
   * So instead of guessing, this publishes the bar's measured height as a
   * custom property on <html> and lets each regime's own stylesheet decide
   * what to do with it:
   *
   *     document.documentElement.style --elaya-shell-h: <measured>px
   *     document.documentElement.classList  .elaya-reserve
   *
   * elaya.css consumes it for the `.phone` regimes and appends a body::after
   * spacer for ordinary flow pages; kiosk.html's fit() subtracts it from the
   * height it scales #stage into. The class gates all of it, so a surface
   * loaded with ?bare=1 (no bar, property never set) is byte-for-byte the
   * layout it always was.
   *
   * The height is MEASURED, never assumed: the bar wraps onto two rows at
   * narrow widths, so it is 45px on a desktop and 81px on a phone. onResize
   * re-measures and re-publishes; restoreReserve puts back whatever inline
   * value the surface itself had (usually none) and drops the class.
   */
  var RESERVE_VAR = '--elaya-shell-h';
  var RESERVE_CLASS = 'elaya-reserve';
  var reserved = null;  // snapshot of <html>'s pre-bar state, while reserved

  /* kiosk.html scales #stage in script and cannot observe a custom property
   * changing, so tell it. Any surface may listen; none is required to. */
  function announce(h) {
    try {
      window.dispatchEvent(new CustomEvent('elaya:reserve', { detail: { height: h } }));
    } catch (e) { /* ignore */ }
  }

  function publish(h) {
    var root = document.documentElement;
    if (reserved === null) {
      reserved = {
        prevInline: root.style.getPropertyValue(RESERVE_VAR),
        prevPriority: root.style.getPropertyPriority(RESERVE_VAR),
        hadClass: root.classList.contains(RESERVE_CLASS)
      };
    }
    if (root.style.getPropertyValue(RESERVE_VAR) === h + 'px' &&
        root.classList.contains(RESERVE_CLASS)) return false;
    root.style.setProperty(RESERVE_VAR, h + 'px');
    root.classList.add(RESERVE_CLASS);
    announce(h);
    return true;
  }

  function applyReserve(nav) {
    try {
      var h = nav.getBoundingClientRect().height;
      if (!h) return;
      if (!publish(h)) return;
      /* Reserving space can add or remove a scrollbar, which changes the
       * width the bar has to lay out in, which can change how many rows it
       * wraps onto. Re-measure once; publish() is a no-op if it settled. */
      var after = nav.getBoundingClientRect().height;
      if (after && after !== h) publish(after);
    } catch (e) { /* ignore */ }
  }

  function restoreReserve() {
    try {
      var root = document.documentElement;
      if (reserved !== null) {
        // Put back exactly what was there — a surface that set the property
        // itself keeps its own value; one that did not gets it removed.
        if (reserved.prevInline) {
          root.style.setProperty(RESERVE_VAR, reserved.prevInline, reserved.prevPriority);
        } else {
          root.style.removeProperty(RESERVE_VAR);
        }
        if (!reserved.hadClass) root.classList.remove(RESERVE_CLASS);
      }
    } catch (e) { /* ignore */ }
    reserved = null;
    announce(0);
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
