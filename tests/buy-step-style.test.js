// The desktop buy step's form (2026-11-06): the site's own dark input style (waitlist.html's: --bg-3 ground,
// --hair-2 edge, 10px corners, the teal focus edge and its 3px ring). Each field on its own row, its label above it.
// The button is full width under them, and an inline line under the button says what happened: error, pending or
// success. The Publication 1345 sentence stays. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const section = html.slice(html.indexOf('<section class="buy" id="buy">'), html.indexOf('</section>', html.indexOf('<section class="buy" id="buy">')));
const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
const flat = (s) => s.replace(/\s+/g, '');

test('each field is on its own row with its label above it, the button full width, and the status line under it', () => {
  const form = section.slice(section.indexOf('<form'), section.indexOf('</form>') + 7);
  for (const [id, name] of [['buy-efin', 'efin'], ['buy-email', 'email']]) {
    const field = form.match(new RegExp(`<div class="buy-field">\\s*<label for="${id}">[^<]+</label>\\s*<input id="${id}" name="${name}"[^>]*>\\s*</div>`));
    assert.ok(field, `${name}: a row of its own, the label above the input`);
  }
  assert.match(form, /<input id="buy-efin" name="efin"[^>]*inputmode="numeric"[^>]*pattern="\[0-9\]\{6\}"/);
  assert.match(form, /<input id="buy-email" name="email"[^>]*type="email"/);
  assert.match(form, /<button type="submit" class="pcta buy-submit">Check my EFIN<\/button>\s*<p id="buy-status" class="buy-status" role="status" aria-live="polite" hidden><\/p>\s*<\/form>/,
    'the status line sits directly under the button, inside the form');
  assert.match(section, /Publication 1345/);
});

test('the form uses the site\'s own dark input style with the teal focus ring, the button is full width, and the line has its states', () => {
  const c = flat(css);
  assert.match(c, /#buy-form\{[^}]*display:flex;[^}]*flex-direction:column;/);
  assert.match(c, /\.buy-field\{[^}]*display:flex;[^}]*flex-direction:column;/);
  assert.match(c, /#buy-forminput\{[^}]*background:var\(--bg-3\);[^}]*border:1pxsolidvar\(--hair-2\);[^}]*border-radius:10px;[^}]*padding:12px14px;[^}]*width:100%/);
  assert.match(c, /#buy-forminput:focus\{[^}]*outline:none;[^}]*border-color:var\(--teal\);[^}]*box-shadow:0003pxrgba\(94,234,212,0\.12\)/);
  assert.match(c, /\.buy-submit\{[^}]*width:100%/);
  assert.match(c, /\.buy-status\[data-state="error"\]\{[^}]*color:var\(--red\)/);
  assert.match(c, /\.buy-status\[data-state="success"\]\{[^}]*color:var\(--green\)/);
});
