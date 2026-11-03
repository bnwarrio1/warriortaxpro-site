// The desktop buy step (EFIN ruling 4, 2026-11-03). IRS Publication 1345 asks for each office's EFIN to be validated
// before the software is sold, so the Professional and Professional Plus buttons open this step instead of a payment
// page. The EFIN and an email go to the relay's /api/checkout/efin-check; payment (/api/checkout/start) opens only for
// a validated EFIN. While Warrior Tax Pro validates by hand, a pending EFIN's handle is checked again every minute.
// The relay's words are shown as text; nothing is stored.
(function () {
  'use strict';
  var RELAY = 'https://api.warriortaxservice.com';
  var POLL_MS = 60 * 1000;
  var POLL_LIMIT = 120; // two hours with the page open; after that the same EFIN and email ask again

  var section = document.getElementById('buy');
  var form = document.getElementById('buy-form');
  var status = document.getElementById('buy-status');
  if (!section || !form || !status) return;

  var tier = '';
  var polls = 0;

  function say(text) {
    status.textContent = text;
    status.hidden = false;
  }

  function pay(efin) {
    location.assign(RELAY + '/api/checkout/start?tier=' + encodeURIComponent(tier) + '&efin=' + encodeURIComponent(efin));
  }

  function unreachable() {
    say('Warrior Tax Pro could not be reached to check the EFIN. Check your connection and try again.');
  }

  function answer(efin, body) {
    if (body && body.status === 'validated') return pay(efin);
    if (body && body.status === 'pending') {
      say(body.message || 'Warrior Tax Pro is validating this EFIN before the sale.');
      return true;
    }
    if (body && body.status === 'refused') return say(body.message || 'This EFIN did not pass validation.');
    say((body && body.error) || 'The EFIN could not be checked. Try again.');
  }

  function poll(efin, handle) {
    if (++polls > POLL_LIMIT) return;
    setTimeout(function () {
      return fetch(RELAY + '/api/checkout/efin-check/' + encodeURIComponent(handle))
        .then(function (r) { return r.json(); })
        .then(function (body) { if (answer(efin, body) === true) poll(efin, handle); })
        .catch(function () { poll(efin, handle); });
    }, POLL_MS);
  }

  function choose(button) {
    return function (e) {
      e.preventDefault();
      tier = button.dataset.tier;
      form.elements.tier.value = tier;
      section.hidden = false;
      if (section.scrollIntoView) section.scrollIntoView();
    };
  }

  var buttons = document.querySelectorAll('[data-tier]');
  for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener('click', choose(buttons[i]));

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var efin = String(form.elements.efin.value || '').trim();
    var email = String(form.elements.email.value || '').trim();
    tier = tier || form.elements.tier.value;
    if (!/^[0-9]{6}$/.test(efin)) return say('An EFIN is six digits.');
    if (!tier) return say('Choose Professional or Professional Plus first.');
    polls = 0;
    return fetch(RELAY + '/api/checkout/efin-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ efin: efin, email: email }),
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (answer(efin, body) === true && body.request) poll(efin, body.request);
      })
      .catch(unreachable);
  });
})();
