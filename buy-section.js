// The desktop buy step (EFIN ruling 4, 2026-11-03). IRS Publication 1345 asks for each office's EFIN to be validated
// before the software is sold, so the Professional and Professional Plus buttons open this step instead of a payment
// page. The EFIN and an email go to the relay's /api/checkout/efin-check; payment (/api/checkout/start) opens only for
// a validated EFIN. While Warrior Tax Pro validates by hand, a pending EFIN's handle is checked again every minute.
// The relay's words are shown as text; nothing is stored.
// The firm's TIN (2026-11-09 item 2, 2026-11-10): the EIN, or the SSN when the EFIN was issued to an individual, with its
// type and the office's ISP authorization, goes to efin-check in the request body only - never a query string - and the
// box is emptied once it is sent. Only the last four the relay returns is shown.
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
  var TIN_NEEDED = "The IRS requires the firm's TIN to verify the EFIN: the EIN, or the SSN when the EFIN was issued to an " +
    'individual, nine digits, and which one it is (EIN or SSN).';

  // The nine digits of a TIN typed with or without its dashes or spaces; null for anything else.
  function tinDigits(typed) {
    var t = String(typed || '').trim();
    if (/[^0-9 -]/.test(t)) return null;
    var digits = t.replace(/[^0-9]/g, '');
    return digits.length === 9 ? digits : null;
  }

  function say(text) {
    status.textContent = text;
    status.hidden = false;
  }

  // The relay binds a validation to the check that earned it (2026-11-10): payment opens from that check's handle,
  // sent with the EFIN. A relay that sends no handle is the build before that one, which takes the EFIN alone.
  function pay(efin, handle) {
    var url = RELAY + '/api/checkout/start?tier=' + encodeURIComponent(tier) + '&efin=' + encodeURIComponent(efin);
    if (/^[0-9a-f]{32}$/.test(String(handle || ''))) url += '&request=' + handle;
    location.assign(url);
  }

  function unreachable() {
    say('Warrior Tax Pro could not be reached to check the EFIN. Check your connection and try again.');
  }

  function answer(efin, body, handle) {
    if (body && body.status === 'validated') return pay(efin, body.request || handle);
    if (body && body.status === 'pending') {
      var words = [body.message || 'Warrior Tax Pro is validating this EFIN before the sale.'];
      if (/^[0-9]{4}$/.test(String(body.tinLastFour || ''))) words.push('(TIN ending ' + body.tinLastFour + '.)');
      if (body.irs) words.push(String(body.irs));
      say(words.join(' '));
      return true;
    }
    if (body && body.status === 'refused') return say(body.message || 'This EFIN did not pass validation.');
    if (body && body.status === 'recheck') return say(body.message || 'Check the EFIN and the TIN and enter them again.');
    say((body && body.error) || 'The EFIN could not be checked. Try again.');
  }

  function poll(efin, handle) {
    if (++polls > POLL_LIMIT) return;
    setTimeout(function () {
      return fetch(RELAY + '/api/checkout/efin-check/' + encodeURIComponent(handle))
        .then(function (r) { return r.json(); })
        .then(function (body) { if (answer(efin, body, handle) === true) poll(efin, handle); })
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
    var tin = tinDigits(form.elements.tin.value);
    var tinType = String(form.elements.tinType.value || '').trim().toUpperCase();
    if (!tin || (tinType !== 'EIN' && tinType !== 'SSN')) return say(TIN_NEEDED);
    var request = JSON.stringify({ efin: efin, email: email, tin: tin, tinType: tinType,
      ispAuthorized: form.elements.ispAuthorized.checked === true });
    form.elements.tin.value = '';
    tin = null;
    polls = 0;
    return fetch(RELAY + '/api/checkout/efin-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request,
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (answer(efin, body) === true && body.request) poll(efin, body.request);
      })
      .catch(unreachable);
  });
})();
