// The Download page's licence form (ruled 2026-11-02): the relay's download is a form POST of the licence
// key, and the page never autofills the key or keeps it - no autocomplete, no localStorage, sessionStorage
// or cookie, and the field is emptied once the form is sent. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'download-section.js'), 'utf8');
const section = html.slice(html.indexOf('<section class="download" id="download">'), html.indexOf('</section>', html.indexOf('id="download"')));

test('the section is a form that POSTs the licence key, not a link', () => {
  assert.match(section, /<form[^>]*id="download-form"[^>]*method="post"/i);
  assert.match(section, /<input[^>]*name="licenseKey"/);
  assert.doesNotMatch(section, /id="download-link"/, 'no plain link to the installer: a link cannot carry the key');
});

test('the key is never autofilled', () => {
  const form = section.match(/<form[^>]*id="download-form"[^>]*>/i)[0];
  const input = section.match(/<input[^>]*name="licenseKey"[^>]*>/)[0];
  assert.match(form, /autocomplete="off"/);
  assert.match(input, /autocomplete="off"/);
  assert.doesNotMatch(input, /type="password"/, 'a password field invites the browser to offer saving it');
  assert.doesNotMatch(input, /\bvalue="/, 'the page never carries a key');
});

test('the page never stores the key', () => {
  for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) {
    assert.ok(!js.includes(store), `download-section.js must not use ${store}`);
    assert.ok(!section.includes(store), `the section must not use ${store}`);
  }
});

test('the form posts to the relay address from download.json, and empties the field once sent', async () => {
  const field = { value: 'WTPE-FAKE-FAKE-FAKE-0000' };
  const listeners = {};
  const form = { action: '', addEventListener: (ev, fn) => { listeners[ev] = fn; }, elements: { licenseKey: field } };
  const els = Object.fromEntries(['download-release', 'download-none', 'download-version', 'download-file', 'download-sha', 'download-signer']
    .map((id) => [id, { id, hidden: id === 'download-release', textContent: '' }]));
  els['download-form'] = form;
  const timers = [];
  const context = {
    URL,
    setTimeout: (fn) => { timers.push(fn); },
    document: { getElementById: (id) => els[id] ?? null },
    fetch: async () => ({ ok: true, json: async () => ({
      version: '1.0.0', file: 'WarriorTaxProElite-1.0.0.msi', sha256: 'c'.repeat(64), size: 1,
      signer: 'Warrior Financial Services LLC', url: 'https://api.warriortaxservice.com/api/updates/installer/download' }) }),
  };
  vm.runInNewContext(js, context);
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(form.action, 'https://api.warriortaxservice.com/api/updates/installer/download');
  assert.equal(els['download-release'].hidden, false);
  assert.equal(typeof listeners.submit, 'function', 'the form empties its field after it is sent');
  listeners.submit({});
  timers.forEach((fn) => fn());
  assert.equal(field.value, '', 'the key does not stay on the page');
});
