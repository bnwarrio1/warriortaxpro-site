// The browser path of download-section.js: it reads download.json and fills the section, or keeps
// "not released yet" when there is no valid file. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'download-section.js'), 'utf8');
const ids = ['download-release', 'download-none', 'download-version', 'download-file', 'download-sha', 'download-signer'];

async function render(json) {
  const els = Object.fromEntries(ids.map((id) => [id, { id, hidden: id === 'download-release', textContent: '' }]));
  els['download-form'] = { action: '#download', dataset: {}, addEventListener() {}, elements: { licenseKey: { value: '' } } };
  const context = {
    URL,
    document: { getElementById: (id) => els[id] ?? null },
    fetch: async () => (json === undefined ? { ok: false } : { ok: true, json: async () => json }),
  };
  vm.runInNewContext(source, context);
  await new Promise((r) => setTimeout(r, 10));
  return els;
}

test('a valid download.json fills the section and points the form at the relay', async () => {
  const els = await render({
    version: '1.0.0', file: 'WarriorTaxProElite-1.0.0.msi', sha256: 'b'.repeat(64), size: 10 * 1024 * 1024,
    signer: 'Warrior Financial Services LLC', url: 'https://api.warriortaxservice.com/download/installer',
  });
  assert.equal(els['download-release'].hidden, false);
  assert.equal(els['download-none'].hidden, true);
  assert.equal(els['download-form'].action, 'https://api.warriortaxservice.com/download/installer');
  assert.equal(els['download-version'].textContent, 'Version 1.0.0 · 10 MB');
  assert.equal(els['download-sha'].textContent, 'b'.repeat(64));
  assert.equal(els['download-signer'].textContent, 'Signed by Warrior Financial Services LLC');
});

test('no download.json keeps "not released yet" and offers nothing', async () => {
  const els = await render(undefined);
  assert.equal(els['download-release'].hidden, true);
  assert.equal(els['download-none'].hidden, false);
  assert.equal(els['download-form'].action, '#download');
});
