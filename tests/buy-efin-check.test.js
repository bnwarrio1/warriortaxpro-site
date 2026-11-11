// The desktop buy buttons (EFIN ruling 4, 2026-11-03): IRS Publication 1345 asks for each office's EFIN to be
// validated before the software is sold. So Professional and Professional Plus no longer go straight to a Stripe
// Payment Link. Our page takes the EFIN and an email, asks the relay's /api/checkout/efin-check, and opens payment
// (/api/checkout/start?tier=&efin=) only once the EFIN is validated. While validation is manual, a pending EFIN is
// shown as pending and its handle is checked again; a refused one is told so and never reaches payment.
// The firm's TIN (the architect's rulings of 2026-11-09 item 2 and 2026-11-10): the step also asks for the firm's EIN,
// or the SSN when the EFIN was issued to an individual, with its type, in a masked box, with one line saying the IRS
// requires it to verify the EFIN, and the office's ISP authorization in the relay's own words. The TIN goes to the
// relay in the request body only - never a query string, never stored on the page - and is shown back as its last
// four. EFINs and TINs are fictional. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'buy-section.js'), 'utf8');
const RELAY = 'https://api.warriortaxservice.com';
const TIN = '987650123';
// The relay's IspAuthorizationText.Wording, version 2026-11-06: the page shows these words exactly.
const ISP_WORDING = 'I authorize Warrior Financial Services, as our Intermediate Service Provider, to validate our EFIN with the IRS and register our Vendor Control Number.';

test('the desktop buttons open the EFIN step, not a Payment Link; the pre-order link is unchanged', () => {
  const pro = html.match(/<a[^>]*data-tier="Professional"[^>]*>Choose Professional<\/a>/);
  const plus = html.match(/<a[^>]*data-tier="ProfessionalPlus"[^>]*>Choose Professional Plus<\/a>/);
  assert.ok(pro && plus, 'both desktop buttons carry their tier');
  for (const a of [pro[0], plus[0]]) {
    assert.doesNotMatch(a, /buy\.stripe\.com/);
    assert.match(a, /href="#buy"/, 'without the script, the button still reaches the buy step');
  }
  assert.ok(!html.includes('buy.stripe.com/8x214nbyO5rtd0f5312B202'), 'the Professional Payment Link is gone');
  assert.ok(!html.includes('buy.stripe.com/28E6oH1Yeg67bWbfHF2B203'), 'the Professional Plus Payment Link is gone');
  assert.ok(html.includes('https://buy.stripe.com/00w3cvbyOg671hxanl2B201'), 'the Online pre-order is pair 5, not this page');
});

test('the buy step asks for the EFIN and an email, and loads its script', () => {
  const section = html.slice(html.indexOf('id="buy"'), html.indexOf('</section>', html.indexOf('id="buy"')));
  assert.match(section, /<form[^>]*id="buy-form"/);
  assert.match(section, /<input[^>]*name="efin"[^>]*inputmode="numeric"[^>]*pattern="\[0-9\]\{6\}"/);
  assert.match(section, /<input[^>]*name="email"[^>]*type="email"/);
  assert.match(section, /Publication 1345/, 'the page says why the EFIN is asked first');
  assert.match(html, /<script src="buy-section\.js" defer><\/script>/);
});

// Bassam's rule (2026-11-11): keep what a buyer sees simple. One masked box in plain words, EIN or SSN as two small
// options with EIN chosen, one line of why, one consent line.
test("the buy step asks for the firm's EIN in one masked box, EIN or SSN as two options, why, and the ISP authorization in the relay's words", () => {
  const section = html.slice(html.indexOf('id="buy"'), html.indexOf('</section>', html.indexOf('id="buy"')));
  const tin = section.match(/<input[^>]*name="tin"[^>]*>/);
  assert.ok(tin, 'a TIN box');
  assert.match(tin[0], /type="password"/, 'masked');
  assert.match(tin[0], /autocomplete="off"/);
  assert.match(tin[0], /inputmode="numeric"/);
  assert.match(tin[0], /required/);
  assert.ok(section.includes('Firm EIN (or your SSN, if the EFIN is in your own name)'), 'the box in plain words');
  assert.doesNotMatch(section, /<select/, 'no drop-down');
  const types = section.match(/<input[^>]*name="tinType"[^>]*>/g) || [];
  assert.equal(types.length, 2, 'EIN or SSN: two small options');
  assert.ok(types.every((t) => /type="radio"/.test(t)));
  assert.ok(types.some((t) => /value="EIN"/.test(t) && /checked/.test(t)), 'EIN is chosen to start with');
  assert.ok(types.some((t) => /value="SSN"/.test(t) && !/checked/.test(t)));
  assert.match(section, /The IRS needs it to check the EFIN\./, 'one line says why');
  assert.doesNotMatch(section, /\bTIN\b/, 'the page says EIN or SSN, never TIN');
  const consent = section.match(/<input[^>]*name="ispAuthorized"[^>]*>/);
  assert.ok(consent, 'the ISP authorization');
  assert.match(consent[0], /type="checkbox"/);
  assert.doesNotMatch(consent[0], /checked/, 'never ticked for the office');
  assert.ok(section.includes(ISP_WORDING), "the authorization in the relay's own words, exactly");
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
    hidden: true,
    elements: { efin: field('900100'), email: field('owner@site.test'), tier: field(''), tin: field('98-7650123'), tinType: field('EIN'),
      ispAuthorized: { checked: true } },
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

// The relay binds a validation to the check that earned it (lane 3's question, 2026-11-10): "validated" comes with that
// check's handle, and /api/checkout/start opens payment only from it. The page sends the handle with the EFIN.
test('a validated EFIN goes to payment with its tier, its EFIN and the handle of the check that validated it', async () => {
  const handle = 'd'.repeat(32);
  const p = page([{ status: 200, body: { status: 'validated', request: handle, tinLastFour: '0123' } }]);
  p.choose('ProfessionalPlus');
  await p.submit(); await settle();

  assert.deepEqual(p.navigated, [`${RELAY}/api/checkout/start?tier=ProfessionalPlus&efin=900100&request=${handle}`]);
});

test('a handle that is not 32 hex characters is never put in the address', async () => {
  const p = page([{ status: 200, body: { status: 'validated', request: 'x&tier=Other' } }]);
  p.choose('Professional');
  await p.submit(); await settle();

  assert.deepEqual(p.navigated, [`${RELAY}/api/checkout/start?tier=Professional&efin=900100`]);
});

test('a validated EFIN from a relay that sends no handle still goes to payment with its tier and EFIN', async () => {
  const p = page([{ status: 200, body: { status: 'validated' } }]);
  p.choose('ProfessionalPlus');
  assert.equal(p.section.hidden, false);
  await p.submit(); await settle();

  assert.equal(p.calls[0].url, `${RELAY}/api/checkout/efin-check`);
  assert.equal(p.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(p.calls[0].body),
    { efin: '900100', email: 'owner@site.test', tin: TIN, tinType: 'EIN', ispAuthorized: true });
  assert.deepEqual(p.navigated, [`${RELAY}/api/checkout/start?tier=ProfessionalPlus&efin=900100`]);
});

test('the TIN goes in the request body only, the box is emptied once sent, and only its last four is shown', async () => {
  const handle = 'b'.repeat(32);
  const p = page([
    { status: 202, body: { status: 'pending', request: handle, message: 'Warrior Tax Pro is validating this EFIN.', tinLastFour: '0123',
      irs: 'EFIN check is not available yet: this server holds no IRS key.' } },
    { status: 200, body: { status: 'validated' } },
  ]);
  p.choose('Professional');
  await p.submit(); await settle();
  assert.equal(p.form.elements.tin.value, '', 'the page keeps no TIN once it is sent');
  assert.match(p.status.textContent, /Warrior Tax Pro is validating this EFIN\./);
  assert.match(p.status.textContent, /TIN ending 0123/);
  assert.match(p.status.textContent, /EFIN check is not available yet/);
  assert.ok(!p.status.textContent.includes(TIN) && !p.status.textContent.includes('98-7650123'));
  await p.tick();
  for (const u of [...p.calls.map((c) => c.url), ...p.navigated]) {
    assert.ok(!u.includes(TIN) && !u.includes('7650123') && !u.includes('0123'), `no TIN in ${u}`);
  }
});

test('without the authorization ticked the page still asks, saying so to the relay', async () => {
  const p = page([{ status: 202, body: { status: 'pending', request: 'c'.repeat(32), message: 'Pending.' } }]);
  p.form.elements.ispAuthorized.checked = false;
  p.choose('Professional');
  await p.submit(); await settle();
  assert.equal(JSON.parse(p.calls[0].body).ispAuthorized, false);
});

test('a TIN that is not nine digits, or no TIN type, is refused on the page without asking the relay, never echoed', async () => {
  for (const [tin, type] of [['12345678', 'EIN'], ['98765012x', 'EIN'], ['', 'EIN'], [TIN, '']]) {
    const p = page([]);
    p.form.elements.tin.value = tin;
    p.form.elements.tinType.value = type;
    p.choose('Professional');
    await p.submit(); await settle();
    assert.equal(p.calls.length, 0, `${tin}/${type}: the relay is not asked`);
    assert.equal(p.status.textContent,
      "Enter the firm's 9-digit EIN, or your SSN if the EFIN is in your own name. The IRS needs it to check the EFIN.");
    assert.ok(!p.status.textContent.includes('12345678') && !p.status.textContent.includes(TIN));
  }
});

test('the IRS finding no match asks the office to check and enter them again, and never reaches payment', async () => {
  const p = page([{ status: 200, body: { status: 'recheck', message: 'Check the EFIN and the TIN with your IRS records and enter them again.' } }]);
  p.choose('Professional');
  await p.submit(); await settle();
  assert.match(p.status.textContent, /Check the EFIN and the TIN/);
  assert.deepEqual(p.navigated, []);
  assert.equal(p.timers.length, 0, 'nothing more is asked');
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
  assert.deepEqual(p.navigated, [`${RELAY}/api/checkout/start?tier=Professional&efin=900100&request=${handle}`],
    'payment opens from the handle the page was waiting on');
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
