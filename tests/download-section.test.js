// The Download section (ruled 2026-11-02): offices download the installer from the relay, the one
// trusted origin. The section shows only what the release step's download.json says.
// Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { downloadView } = require('../download-section.js');

const release = {
  version: '1.0.0',
  file: 'WarriorTaxProElite-1.0.0.msi',
  sha256: 'a'.repeat(64),
  size: 254803968,
  signer: 'Warrior Financial Services LLC',
  url: 'https://api.warriortaxservice.com/download/installer',
};

test('a released installer shows its version, file, SHA-256, signer and the relay link', () => {
  const view = downloadView(release);
  assert.equal(view.href, release.url);
  assert.equal(view.version, 'Version 1.0.0');
  assert.equal(view.file, 'WarriorTaxProElite-1.0.0.msi');
  assert.equal(view.sha256, release.sha256);
  assert.equal(view.signer, 'Signed by Warrior Financial Services LLC');
  assert.equal(view.size, '243 MB');
});

for (const [why, bad] of [
  ['no file', null],
  ['an http link', { ...release, url: 'http://api.warriortaxservice.com/download/installer' }],
  ['a link that is not a URL', { ...release, url: 'download/installer' }],
  ['a hash that is not SHA-256', { ...release, sha256: 'abc' }],
  ['no signer', { ...release, signer: '' }],
  ['a version that is not X.Y.Z', { ...release, version: 'latest' }],
  ['a file that is not the .msi', { ...release, file: 'setup.exe' }],
]) {
  test(`${why}: no download is offered`, () => assert.equal(downloadView(bad), null));
}
