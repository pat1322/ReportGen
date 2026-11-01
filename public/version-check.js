/* Polls /version so a returning visitor sees new deploys without clearing cache/site data.
   Checks on load, on an interval, and whenever the tab regains focus/visibility
   ("every time you open the site"). On a mismatch it shows a banner with a Reload button —
   the server sends Cache-Control: no-store on every response, so a normal reload is enough
   to pick up the new files. */
(function () {
  'use strict';
  var CHECK_MS = 2 * 60 * 1000;
  var known = null;

  function banner(show) {
    var b = document.getElementById('updateBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'updateBanner';
      b.className = 'update-banner';
      var span = document.createElement('span'); span.textContent = 'A new version of this app is available.';
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Reload';
      btn.addEventListener('click', function () { location.reload(); });
      b.append(span, btn);
      document.body.appendChild(b);
    }
    b.classList.toggle('show', show);
  }

  function check() {
    fetch('/version', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.version) return;
        if (known === null) { known = d.version; return; }
        if (d.version !== known) banner(true);
      })
      .catch(function () { /* offline or blocked — try again next interval */ });
  }

  check();
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
})();
