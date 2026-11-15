/* Home page: puts the game logos into the "The four games" section. Read-only, same-origin, no effect on the hub cards. */
(function () {
  'use strict';
  var SIN = window.SIN;
  var slots = document.querySelectorAll('[data-logo]');
  if (!SIN || !slots.length) return;
  Array.prototype.forEach.call(slots, function (el) {
    fetch(SIN.url('assets/logos/' + el.getAttribute('data-logo') + '.svg')).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      if (t) el.innerHTML = t.replace(/<svg /, '<svg aria-hidden="true" focusable="false" ').replace(/ role="img"| aria-label="[^"]*"/g, '');
    }).catch(function () {});
  });
})();
