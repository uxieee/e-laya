/* elaya-shell.js — an out-of-fiction reviewer bar.
 *
 * Deliberately NOT in-fiction navigation. The kiosk is a terminal bolted to a
 * jail wall; a control offering "switch to PAO caseload" would be a lie about
 * the product. So this is visibly a review aid: dark, fixed, labelled, and
 * removable with ?bare=1 for filming and screenshots.
 */
(function () {
  'use strict';

  var HIDDEN_KEY = 'elaya.shell.hidden';

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
    try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch (e) { return false; }
  }

  function hide() {
    try { localStorage.setItem(HIDDEN_KEY, '1'); } catch (e) { /* ignore */ }
    var el = document.getElementById('elaya-shell');
    if (el) el.remove();
  }

  function build() {
    if (new URLSearchParams(location.search).get('bare') === '1') return;
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
      if (window.Elaya) window.Elaya.reset();
      location.reload();
    });
    nav.appendChild(reset);

    var close = document.createElement('button');
    close.setAttribute('data-act', 'hide');
    close.setAttribute('aria-label', 'Hide reviewer bar');
    close.textContent = '×';
    close.addEventListener('click', hide);
    nav.appendChild(close);

    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
