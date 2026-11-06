// The desktop buy buttons (EFIN ruling 4, 2026-11-03): IRS Publication 1345 asks for each office's EFIN to be
// validated before the software is sold. So Professional and Professional Plus no longer go straight to a Stripe
// Payment Link. Our page takes the EFIN and an email, asks the relay's /api/checkout/efin-check, and opens payment
// (/api/checkout/start?tier=&efin=) only once the EFIN is validated. While validation is manual, a pending EFIN is
// shown as pending and its handle is checked again; a refused one is told so and never reaches payment.
// EFINs are fictional. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'buy-section.js'), 'utf8');
const RELAY = 'https://api.warriortaxservice.com';

test('the desktop buttons open the EFIN step, not a Payment Link', () => {
  const pro = html.match(/<a[^>]*data-tier="Professional"[^>]*>Choose Professional<\/a>/);
  const plus = html.match(/<a[^>]*data-tier="ProfessionalPlus"[^>]*>Choose Professional Plus<\/a>/);
  assert.ok(pro && plus, 'both desktop buttons carry their tier');
  for (const a of [pro[0], plus[0]]) {
    assert.doesNotMatch(a, /buy\.stripe\.com/);
    assert.match(a, /href="#buy"/, 'without the script, the button still reaches the buy step');
  }
  assert.ok(!html.includes('buy.stripe.com/8x214nbyO5rtd0f5312B202'), 'the Professional Payment Link is gone');
  assert.ok(!html.includes('buy.stripe.com/28E6oH1Yeg67bWbfHF2B203'), 'the Professional Plus Payment Link is gone');
  // The Online card goes to the Pro checkout step (tests/online-card.test.js), never straight to a Payment Link.
});

test('the buy step asks for the EFIN and an email, and loads its script', () => {
  const section = html.slice(html.indexOf('id="buy"'), html.indexOf('</section>', html.indexOf('id="buy"')));
  assert.match(section, /<form[^>]*id="buy-form"/);
  assert.match(section, /<input[^>]*name="efin"[^>]*inputmode="numeric"[^>]*pattern="\[0-9\]\{6\}"/);
  assert.match(section, /<input[^>]*name="email"[^>]*type="email"/);
  assert.match(section, /Publication 1345/, 'the page says why the EFIN is asked first');
  assert.match(html, /<script src="buy-section\.js" defer><\/script>/);
});

test('the script asks only the relay, writes text only, and keeps nothing', () => {
  assert.ok(js.includes(`'${RELAY}'`));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(js), 'the relay\'s words go in as text');
  for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB'])
    assert.ok(!js.includes(store), `buy-section.js must not use ${store}`);
});

// A page, a relay that answers from a script of replies, and a clock that runs the polls at once.
function page(replies) {
  const calls = [];
  const navigated = [];
  const timers = [];
  const listeners = {};
  const field = (v) => ({ value: v });
  const form = {
    hidden: true, elements: { efin: field('900100'), email: field('owner@site.test'), tier: field('') },
    addEventListener: (ev, fn) => { listeners['form:' + ev] = fn; },
  };
  const status = { textContent: '', hidden: true };
  const section = { hidden: true, scrollIntoView() {} };
  const buttons = ['Professional', 'ProfessionalPlus'].map((tier) => ({
    dataset: { tier }, addEventListener: (ev, fn) => { listeners['btn:' + tier + ':' + ev] = fn; },
  }));
  const context = {
    URL, encodeURIComponent, JSON,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    location: { assign: (u) => navigated.push(u) },
    document: {
      getElementById: (id) => ({ buy: section, 'buy-form': form, 'buy-status': status })[id] ?? null,
      querySelectorAll: (sel) => (sel === '[data-tier]' ? buttons : []),
    },
    fetch: async (url, init) => {
      calls.push({ url, method: (init && init.method) || 'GET', body: init && init.body });
      const r = replies.shift();
      if (r === 'down') throw new TypeError('Failed to fetch');
      return { status: r.status, ok: r.status < 300, json: async () => r.body };
    },
  };
  vm.runInNewContext(js, context);
  return {
    calls, navigated, status, section, form, timers,
    choose: (tier) => listeners['btn:' + tier + ':click']({ preventDefault() {} }),
    submit: () => listeners['form:submit']({ preventDefault() {} }),
    tick: async () => { const t = timers.splice(0); for (const fn of t) await fn(); await new Promise((r) => setImmediate(r)); },
  };
}
const settle = () => new Promise((r) => setImmediate(r));

test('a validated EFIN goes straight to payment with its tier and EFIN', async () => {
  const p = page([{ status: 200, body: { status: 'validated' } }]);
  p.choose('ProfessionalPlus');
  assert.equal(p.section.hidden, false);
  await p.submit(); await settle();

  assert.equal(p.calls[0].url, `${RELAY}/api/checkout/efin-check`);
  assert.equal(p.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(p.calls[0].body), { efin: '900100', email: 'owner@site.test' });
  assert.deepEqual(p.navigated, [`${RELAY}/api/checkout/start?tier=ProfessionalPlus&efin=900100`]);
});

test('a pending EFIN is shown as pending, its handle checked again, and payment opens once validated', async () => {
  const handle = 'a'.repeat(32);
  const p = page([
    { status: 202, body: { status: 'pending', request: handle, message: 'Warrior Tax Pro is validating this EFIN.' } },
    { status: 200, body: { status: 'pending', message: 'Warrior Tax Pro is validating this EFIN.' } },
    { status: 200, body: { status: 'validated' } },
  ]);
  p.choose('Professional');
  await p.submit(); await settle();
  assert.equal(p.status.textContent, 'Warrior Tax Pro is validating this EFIN.');
  assert.equal(p.status.hidden, false);
  assert.deepEqual(p.navigated, []);

  await p.tick();
  assert.equal(p.calls[1].url, `${RELAY}/api/checkout/efin-check/${handle}`);
  assert.deepEqual(p.navigated, [], 'still pending');
  await p.tick();
  assert.deepEqual(p.navigated, [`${RELAY}/api/checkout/start?tier=Professional&efin=900100`]);
});

test('a refused EFIN is told so and never reaches payment', async () => {
  const p = page([{ status: 200, body: { status: 'refused', message: 'This EFIN did not pass validation for the 2026 tax year.' } }]);
  p.choose('Professional');
  await p.submit(); await settle();
  assert.equal(p.status.textContent, 'This EFIN did not pass validation for the 2026 tax year.');
  assert.deepEqual(p.navigated, []);
  assert.equal(p.timers.length, 0, 'nothing more is asked');
});

test('a malformed EFIN is refused on the page without asking the relay', async () => {
  const p = page([]);
  p.form.elements.efin.value = '12345';
  p.choose('Professional');
  await p.submit(); await settle();
  assert.equal(p.calls.length, 0);
  assert.match(p.status.textContent, /six digits/);
});

test('the relay\'s own refusal and an unreachable relay are said in words, never payment', async () => {
  const bad = page([{ status: 400, body: { error: 'An email address is needed, so Warrior Tax Pro can reach you about the EFIN.' } }]);
  bad.choose('Professional');
  await bad.submit(); await settle();
  assert.match(bad.status.textContent, /email address is needed/);

  const down = page(['down']);
  down.choose('Professional');
  await down.submit(); await settle();
  assert.match(down.status.textContent, /could not be reached/);
  assert.deepEqual([...bad.navigated, ...down.navigated], []);
});
