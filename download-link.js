// The Download page as a licence email's link opens it (architect's rulings, 2026-11-09). The installer is never a
// public URL: each licence email carries its own link, this page's address followed by # and a token. A browser never
// sends what follows the #, so the token is in no server or proxy log. This script posts it to the relay in a form
// body: first to learn what to show, then, from the one Download button, to download (the form's own POST).
// "Email me a new link" posts a licence key the same way; the link goes to the address on the licence, never to this
// page. The relay's words are shown as text; nothing is stored.
(function () {
  'use strict';
  var RELAY = 'https://api.warriortaxservice.com';
  var FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

  function el(id) { return document.getElementById(id); }
  function show(node, text) {
    if (!node) return;
    if (typeof text === 'string') node.textContent = text;
    node.hidden = false;
  }

  // ── a new link, by email ───────────────────────────────────────────────
  var newForm = el('new-link-form');
  var newStatus = el('new-link-status');
  if (newForm && newStatus) {
    newForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var field = newForm.elements.licenseKey;
      var key = String(field.value || '').trim();
      if (!key) return show(newStatus, 'Enter your licence key.');
      fetch(RELAY + '/api/updates/installer/new-link', {
        method: 'POST', headers: FORM, body: 'licenseKey=' + encodeURIComponent(key),
      }).then(function (res) {
        return res.json().then(function (body) {
          field.value = '';
          show(newStatus, (body && body.message) || 'Warrior Tax Pro could not be reached. Check your connection and try again.');
        });
      }).catch(function () {
        show(newStatus, 'Warrior Tax Pro could not be reached. Check your connection and try again.');
      });
    });
  }

  // ── this link ──────────────────────────────────────────────────────────
  var box = el('download-link');
  var status = el('download-status');
  var form = el('download-form');
  if (!box || !status || !form) return;

  // A link's token is 256 random bits in the URL-safe alphabet: 43 characters. Anything else is not a link.
  var token = String(location.hash || '').slice(1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;

  function say(text) {
    show(box);
    show(status, text);
  }
  function unreachable() {
    say('Warrior Tax Pro could not be reached to check this link. Check your connection, then open the link in your email again.');
  }

  // Only an installer's description is shown: each part checked before it is put on the page.
  function described(d) {
    return d && typeof d === 'object'
      && /^\d+\.\d+\.\d+$/.test(String(d.version))
      && /^[A-Za-z0-9._-]+\.msi$/.test(String(d.file))
      && /^[0-9a-f]{64}$/.test(String(d.sha256))
      && typeof d.publisher === 'string' && d.publisher.length > 0
      && typeof d.downloadsLeft === 'number' && d.downloadsLeft >= 0;
  }

  var left = 0;
  var until = '';
  function showLeft() {
    show(el('dl-left'), left + (left === 1 ? ' download left' : ' downloads left') + (until ? ', until ' + until : ''));
    var button = form.querySelector('button');
    if (button) button.disabled = left <= 0;
  }

  fetch(RELAY + '/api/updates/installer/link', {
    method: 'POST', headers: FORM, body: 'token=' + encodeURIComponent(token),
  }).then(function (res) {
    return res.json().then(function (body) {
      if (res.status === 404) return say('The installer is not released yet. Your link will work once it is.');
      if (res.status !== 200) return say((body && body.error) || 'This download link cannot be used. Ask for a new link below.');
      if (!described(body)) return unreachable();

      var size = typeof body.size === 'number' && body.size > 0 ? Math.round(body.size / (1024 * 1024)) + ' MB' : '';
      var expires = new Date(body.expiresAtUtc);
      left = body.downloadsLeft;
      until = isNaN(expires.getTime()) ? '' : expires.toLocaleString();
      show(el('dl-version'), body.version);
      show(el('dl-file'), body.file);
      show(el('dl-size'), size);
      show(el('dl-sha256'), body.sha256);
      show(el('dl-publisher'), body.publisher);
      showLeft();
      show(el('dl-check-line'), "(Get-FileHash '.\\" + body.file + "' -Algorithm SHA256).Hash -eq '" + body.sha256 + "'");
      show(el('dl-check'));
      show(el('download-facts'));
      form.elements.token.value = token;
      show(form);
      show(box);
      var placeholder = el('download-placeholder');
      if (placeholder) placeholder.hidden = true;
    });
  }).catch(unreachable);

  // The download is the form's own POST to the relay: the browser saves the file and this page stays.
  form.addEventListener('submit', function () {
    left = Math.max(0, left - 1);
    showLeft();
    show(status, 'Your download has started. If it has not, wait a minute and press Download again.');
  });
})();
