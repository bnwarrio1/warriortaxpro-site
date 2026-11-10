// The Download page as a licence email's link opens it (architect's rulings, 2026-11-09). The installer is never a
// public URL: each licence email carries its own link, https://warriortaxpro.com/download#<token>. What follows the #
// is never sent to a server, so the token is in no server or proxy log. The page's script posts it to the relay in a
// form body: first to learn what to show (version, file, size, SHA-256, publisher, what the link has left), then, from
// one Download button, to download. A link that cannot be used shows the relay's one sentence. "Email me a new link"
// posts a licence key the same way and shows the relay's one answer; the page is never shown a link.
// Tokens and keys here are fictional. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'download.html'), 'utf8');
const jsPath = path.join(root, 'download-link.js');
const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
const RELAY = 'https://api.warriortaxservice.com';
const TOKEN = 'T'.repeat(43);
const SHA = 'ab'.repeat(32);
const GOOD = {
  version: '1.0.0', file: 'WarriorTaxProElite-1.0.0.msi', size: 183500800, sha256: SHA,
  publisher: 'Warrior Financial Services LLC', expiresAtUtc: '2026-11-27T15:00:00Z', downloadsLeft: 5,
};

test('the page has one Download button, a form that posts the token to the relay, and no link to the installer', () => {
  const form = html.match(/<form[^>]*id="download-form"[^>]*>[\s\S]*?<\/form>/);
  assert.ok(form, 'the download form');
  assert.match(form[0], /method="post"/);
  assert.match(form[0], new RegExp(`action="${RELAY}/api/updates/installer/download"`));
  assert.match(form[0], /<input[^>]*type="hidden"[^>]*name="token"/);
  assert.equal((form[0].match(/<button/g) || []).length, 1, 'one Download button');
  assert.match(html, /<form[^>]*id="download-form"[^>]*hidden/, 'hidden until the relay has described the link');
  assert.doesNotMatch(html, /href="[^"]*\.msi"/, 'never a link to the installer');
  assert.match(html, /<script src="download-link\.js" defer><\/script>/);
  assert.match(html, /<meta name="referrer" content="no-referrer"/);
});

test('the page asks for a new link with a licence key that the browser does not keep', () => {
  const form = html.match(/<form[^>]*id="new-link-form"[^>]*>[\s\S]*?<\/form>/);
  assert.ok(form, 'the new-link form');
  assert.match(form[0], /<input[^>]*name="licenseKey"[^>]*autocomplete="off"/);
  assert.match(form[0], /Email me a new link/);
  assert.doesNotMatch(form[0], /type="email"/, 'the link goes to the address on the licence, never one typed here');
});

test('the script asks only the relay, writes text only, keeps nothing, and never puts a token or key in a URL', () => {
  assert.ok(js.includes(`'${RELAY}'`));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'the relay\'s words go in as text');
  for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB'])
    assert.ok(!js.includes(store), `download-link.js must not use ${store}`);
  assert.ok(!/[?&](token|licenseKey)=/.test(js), 'a token or key is sent in a body, never a query');
});

// A page opened at `hash`, and a relay that answers from a script of replies.
function page(hash, replies) {
  const calls = [];
  const listeners = {};
  const el = (extra) => Object.assign({ hidden: true, textContent: '', value: '' }, extra);
  const els = {
    'download-link': el(), 'download-status': el(), 'download-facts': el(), 'download-placeholder': el({ hidden: false }),
    'dl-version': el(), 'dl-file': el(), 'dl-size': el(), 'dl-sha256': el(), 'dl-publisher': el(), 'dl-left': el(),
    'dl-check': el(), 'dl-check-line': el(),
    'download-form': el({ elements: { token: el() }, addEventListener: (ev, fn) => { listeners['download:' + ev] = fn; } }),
    'new-link-form': el({ hidden: false, elements: { licenseKey: el({ value: 'WTPE-TEST-TEST-TEST-0001' }) },
      addEventListener: (ev, fn) => { listeners['new:' + ev] = fn; } }),
    'new-link-status': el(),
  };
  els['download-form'].querySelector = () => els['download-button'];
  els['download-button'] = el({ disabled: false });
  const context = {
    URL, encodeURIComponent, JSON, Date, Math, Number, String,
    location: { hash },
    document: { getElementById: (id) => els[id] ?? null },
    fetch: async (url, init) => {
      calls.push({ url, method: init && init.method, type: init && init.headers && init.headers['Content-Type'], body: init && init.body });
      const r = replies.shift();
      if (!r || r === 'down') throw new TypeError('Failed to fetch');
      return { status: r.status, ok: r.status < 300, json: async () => r.body };
    },
  };
  vm.runInNewContext(js, context);
  return {
    calls, els,
    download: () => listeners['download:submit']({ preventDefault() { throw new Error('the download is a real form POST'); } }),
    askNew: () => listeners['new:submit']({ preventDefault() {} }),
  };
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

test('a link is described by the relay and the Download button carries its token', async () => {
  const p = page('#' + TOKEN, [{ status: 200, body: GOOD }]);
  await settle();

  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].url, `${RELAY}/api/updates/installer/link`);
  assert.equal(p.calls[0].method, 'POST');
  assert.equal(p.calls[0].type, 'application/x-www-form-urlencoded', 'a form body needs no preflight');
  assert.equal(p.calls[0].body, 'token=' + TOKEN);
  assert.equal(p.els['dl-version'].textContent, '1.0.0');
  assert.equal(p.els['dl-file'].textContent, 'WarriorTaxProElite-1.0.0.msi');
  assert.equal(p.els['dl-size'].textContent, '175 MB');
  assert.equal(p.els['dl-sha256'].textContent, SHA);
  assert.equal(p.els['dl-publisher'].textContent, 'Warrior Financial Services LLC');
  assert.match(p.els['dl-left'].textContent, /^5 downloads left, until /);
  assert.ok(p.els['dl-check-line'].textContent.includes('Get-FileHash') && p.els['dl-check-line'].textContent.includes(SHA));
  assert.equal(p.els['download-form'].elements.token.value, TOKEN);
  for (const id of ['download-link', 'download-facts', 'dl-check', 'download-form'])
    assert.equal(p.els[id].hidden, false, id + ' is shown');
  assert.equal(p.els['download-placeholder'].hidden, true);
});

test('pressing Download is a real form POST, and the page says so and counts it', async () => {
  const p = page('#' + TOKEN, [{ status: 200, body: Object.assign({}, GOOD, { downloadsLeft: 1 }) }]);
  await settle();

  p.download();

  assert.equal(p.calls.length, 1, 'the download is the form\'s own POST, not a fetch');
  assert.match(p.els['download-status'].textContent, /download has started/i);
  assert.equal(p.els['download-status'].hidden, false);
  assert.match(p.els['dl-left'].textContent, /^0 downloads left/);
});

test('a link that cannot be used shows the relay\'s sentence and no Download button', async () => {
  const sentence = 'That download link cannot be used right now. Ask for a new link, or wait a minute and try again.';
  const p = page('#' + TOKEN, [{ status: 403, body: { error: sentence } }]);
  await settle();

  assert.equal(p.els['download-status'].textContent, sentence);
  assert.equal(p.els['download-status'].hidden, false);
  assert.equal(p.els['download-form'].hidden, true);
  assert.equal(p.els['download-form'].elements.token.value, '');
});

test('with nothing released, or the relay out of reach, the page says so and offers no button', async () => {
  const none = page('#' + TOKEN, [{ status: 404, body: { error: 'No installer is published.' } }]);
  await settle();
  assert.match(none.els['download-status'].textContent, /not released yet/);
  assert.equal(none.els['download-form'].hidden, true);

  const down = page('#' + TOKEN, ['down']);
  await settle();
  assert.match(down.els['download-status'].textContent, /could not be reached/);
  assert.equal(down.els['download-form'].hidden, true);
});

test('an answer that is not an installer\'s description is not shown', async () => {
  for (const bad of [{ sha256: 'short' }, { file: '../other.exe' }, { version: '<b>1</b>' }, { publisher: '' }]) {
    const p = page('#' + TOKEN, [{ status: 200, body: Object.assign({}, GOOD, bad) }]);
    await settle();
    assert.equal(p.els['download-form'].hidden, true, JSON.stringify(bad));
    assert.match(p.els['download-status'].textContent, /could not be reached/);
  }
});

test('opened without a link, or with something that is not one, the page asks the relay nothing', async () => {
  for (const hash of ['', '#', '#pricing', '#' + 'T'.repeat(42), '#' + 'T'.repeat(42) + '!']) {
    const p = page(hash, []);
    await settle();
    assert.equal(p.calls.length, 0, JSON.stringify(hash));
    assert.equal(p.els['download-placeholder'].hidden, false);
    assert.equal(p.els['download-form'].hidden, true);
  }
});

test('"Email me a new link" posts the licence key in a body, shows the relay\'s one answer and empties the field', async () => {
  const answer = 'If that licence key is right, a new download link is on its way to the email address on the licence.';
  const p = page('', [{ status: 200, body: { message: answer } }]);

  p.askNew();
  await settle();

  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].url, `${RELAY}/api/updates/installer/new-link`);
  assert.equal(p.calls[0].method, 'POST');
  assert.equal(p.calls[0].body, 'licenseKey=WTPE-TEST-TEST-TEST-0001');
  assert.equal(p.els['new-link-status'].textContent, answer);
  assert.equal(p.els['new-link-status'].hidden, false);
  assert.equal(p.els['new-link-form'].elements.licenseKey.value, '');

  const down = page('', ['down']);
  down.askNew();
  await settle();
  assert.match(down.els['new-link-status'].textContent, /could not be reached/);
});
