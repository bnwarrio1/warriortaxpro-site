// Warrior Tax Pro Elite Online on warriortaxpro.com (2026-11-06): Pro Online is live and sold as a one-time payment
// for one year, with no automatic renewal and no pre-order. The Online card's button reads "Get started" and goes to
// warriortaxproonline.com's own checkout step, which shows the one-time disclosure and its box before Stripe. No page
// on this site says "pre-order", "pre-launch" or that access opens on November 22. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const PRE = /pre-?orders?|pre-?launch|access\s+opens|nov(ember)?\.?\s+22/i;
const CHECKOUT = 'https://warriortaxproonline.com/pro#checkout';

test('no page on the site says pre-order, pre-launch or that access opens on November 22', () => {
  for (const page of fs.readdirSync(root).filter((f) => f.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((text.match(PRE) || [null])[0], null, `${page} still says it`);
  }
});

test('the Online card sells one year for a one-time payment, and its button is "Get started" to the Pro checkout', () => {
  const start = html.indexOf('Warrior Tax Pro Elite Online');
  const card = html.slice(start, html.indexOf('</div>\n\n', start));
  assert.match(card, new RegExp(`<a class="pcta" href="${CHECKOUT.replace(/[.#/]/g, (c) => '\\' + c)}">Get started</a>`));
  assert.match(card, /one-time payment/i);
  assert.match(card, /one year/i);
  assert.match(card, /no automatic renewal/i);
  assert.ok(!html.includes('buy.stripe.com/00w3cvbyOg671hxanl2B201'),
    'not straight to Stripe: the Pro checkout step shows the one-time disclosure and its box first');
});
