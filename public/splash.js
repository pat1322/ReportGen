/* Hides #splash once the page has finished loading (external file: the server's CSP has no
   'unsafe-inline', so this can't live as an inline <script> in index.html). */
(function () {
  'use strict';
  var MIN_MS = 450, start = Date.now();
  function hide() {
    var el = document.getElementById('splash');
    if (!el) return;
    var wait = Math.max(0, MIN_MS - (Date.now() - start));
    setTimeout(function () {
      el.classList.add('hide');
      setTimeout(function () { el.remove(); }, 400);
    }, wait);
  }
  if (document.readyState === 'complete') hide();
  else window.addEventListener('load', hide);
})();
