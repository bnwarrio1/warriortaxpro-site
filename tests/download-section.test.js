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
  // The form POSTs the licence key to this address, so it must be the relay's own host (lane 3, 2026-11-03).
  ['another site', { ...release, url: 'https://downloads.example.com/api/updates/installer/download' }],
  ['a lookalike host', { ...release, url: 'https://api.warriortaxservice.com.example.net/api/updates/installer/download' }],
  ['a subdomain of the relay', { ...release, url: 'https://x.api.warriortaxservice.com/api/updates/installer/download' }],
  ['the relay with a user part', { ...release, url: 'https://evil@api.warriortaxservice.com/api/updates/installer/download' }],
  ['the relay on another port', { ...release, url: 'https://api.warriortaxservice.com:8443/api/updates/installer/download' }],
  ['a link that is not a URL', { ...release, url: 'download/installer' }],
  ['a hash that is not SHA-256', { ...release, sha256: 'abc' }],
  ['no signer', { ...release, signer: '' }],
  ['a version that is not X.Y.Z', { ...release, version: 'latest' }],
  ['a file that is not the .msi', { ...release, file: 'setup.exe' }],
]) {
  test(`${why}: no download is offered`, () => assert.equal(downloadView(bad), null));
}
