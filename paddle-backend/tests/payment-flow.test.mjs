import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(testsDir, '..');
const webRoot = path.resolve(backendDir, '..');

function readWebFile(...parts) {
  return readFileSync(path.join(webRoot, ...parts), 'utf8');
}

function extractInlineScript(html) {
  const match = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/);
  assert.ok(match, 'Expected an inline script block with payment page logic');
  return `'use strict';${match[1]}`;
}

class FakeElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.options = [];
    this.listeners = new Map();
    this._classes = new Set();
    this.attributes = new Map();
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  get classList() {
    return {
      add: (...tokens) => tokens.forEach(token => this._classes.add(token)),
      remove: (...tokens) => tokens.forEach(token => this._classes.delete(token)),
      contains: token => this._classes.has(token),
      toggle: (token, force) => {
        if (force === true) {
          this._classes.add(token);
          return true;
        }
        if (force === false) {
          this._classes.delete(token);
          return false;
        }
        if (this._classes.has(token)) {
          this._classes.delete(token);
          return false;
        }
        this._classes.add(token);
        return true;
      },
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      preventDefault() {},
      ...init,
    };
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }

  closest() {
    return null;
  }
}

function createPaymentHarness({ search = '?pack=pro&country=Pakistan&currency=PKR', hostname = 'localhost', fetchImpl } = {}) {
  const ids = [
    'packOptions', 'countrySelect', 'currencySelect', 'pakistanMethods', 'globalCheckout',
    'checkoutBtn', 'checkoutStatus', 'navBurger', 'navLinks', 'year', 'referenceCode',
    'planName', 'planCredits', 'planPerLead', 'planCurrency', 'planPrice', 'planPriceNote',
    'summaryPlan', 'summaryCountry', 'summaryCurrency'
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const navAnchors = [new FakeElement('', 'a'), new FakeElement('', 'a')];
  const packOptions = elements.get('packOptions');
  const countrySelect = elements.get('countrySelect');
  const currencySelect = elements.get('currencySelect');
  const pakistanMethods = elements.get('pakistanMethods');
  const globalCheckout = elements.get('globalCheckout');

  pakistanMethods.className = 'method-grid hidden';
  globalCheckout.className = 'method checkout-card hidden';
  elements.get('checkoutStatus').className = 'checkout-status pending';
  elements.get('checkoutBtn').tagName = 'BUTTON';

  countrySelect.options = [
    'Pakistan', 'United Arab Emirates', 'Saudi Arabia', 'United Kingdom', 'United States',
    'Canada', 'Australia', 'Germany', 'India'
  ].map(value => ({ value }));
  currencySelect.options = ['PKR', 'USD', 'AED', 'SAR', 'GBP', 'EUR', 'CAD', 'AUD', 'INR'].map(value => ({ value }));

  const location = {
    hostname,
    pathname: '/payment/',
    search,
    href: `https://${hostname}/payment/${search}`,
  };

  const history = {
    replaceState(_state, _title, next) {
      const url = new URL(next, `${hostname === 'localhost' ? 'http' : 'https'}://${hostname}`);
      location.pathname = url.pathname;
      location.search = url.search;
      location.href = url.toString();
    },
  };

  const document = {
    getElementById(id) {
      const element = elements.get(id);
      if (!element) throw new Error(`Unknown element requested: ${id}`);
      return element;
    },
    createElement(tagName) {
      return new FakeElement('', tagName);
    },
    querySelectorAll(selector) {
      if (selector === '#navLinks a') return navAnchors;
      return [];
    },
  };

  const window = { location, history };
  const context = vm.createContext({
    window,
    document,
    URL,
    URLSearchParams,
    console,
    fetch: fetchImpl,
    Array,
    Date,
    setTimeout,
    clearTimeout,
  });

  return { context, elements, location, navAnchors, packOptions, countrySelect, currencySelect };
}

async function runPaymentPage(options) {
  const html = readWebFile('payment', 'index.html');
  const script = extractInlineScript(html);
  const harness = createPaymentHarness(options);
  vm.runInContext(script, harness.context);
  await delay(0);
  await delay(0);
  return harness;
}

async function withServer(env, callback) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${env.PORT}`;
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        try {
          return await callback(baseUrl);
        } finally {
          child.kill();
        }
      }
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }

  child.kill();
  throw new Error(`Server did not become ready. ${lastError?.message || output}`);
}

test('index page routes pricing cards and site nav to the payment page', () => {
  const html = readWebFile('index.html');
  assert.match(html, /href="payment\/"/);
  assert.match(html, /href="payment\/\?pack=starter"/);
  assert.match(html, /href="payment\/\?pack=pro"/);
  assert.match(html, /href="payment\/\?pack=agency"/);
  assert.match(html, /data-payment-pack="starter"/);
  assert.match(html, /data-payment-pack="pro"/);
  assert.match(html, /data-payment-pack="agency"/);
  assert.doesNotMatch(html, /Gumroad/);
});

test('secondary pages expose payment links and legal copy references Paddle instead of Gumroad', () => {
  const aboutHtml = readWebFile('about.html');
  const termsHtml = readWebFile('terms-and-conditions.html');
  assert.match(aboutHtml, /href="payment\/"/);
  assert.match(termsHtml, /href="payment\/"/);
  assert.match(termsHtml, /processed through <strong>Paddle<\/strong> or approved direct payment methods/);
  assert.doesNotMatch(termsHtml, /Gumroad/);
});

test('payment page shows Pakistan payment methods when Pakistan is selected', async () => {
  const harness = await runPaymentPage({
    search: '?pack=agency&country=Pakistan&currency=PKR',
    fetchImpl: async () => ({ ok: true, json: async () => ({ checkoutUrl: 'https://buy.paddle.com/test' }) }),
  });

  assert.equal(harness.elements.get('planName').textContent, 'Agency Pack');
  assert.equal(harness.elements.get('summaryCountry').textContent, 'Pakistan');
  assert.equal(harness.elements.get('summaryCurrency').textContent, 'PKR');
  assert.equal(harness.elements.get('referenceCode').textContent, 'MLS-AGENCY-PKR');
  assert.equal(harness.elements.get('pakistanMethods').classList.contains('hidden'), false);
  assert.equal(harness.elements.get('globalCheckout').classList.contains('hidden'), true);
});

test('payment page shows hosted checkout outside Pakistan and redirects to configured URL', async () => {
  const harness = await runPaymentPage({
    search: '?pack=starter&country=Canada&currency=CAD',
    fetchImpl: async () => ({ ok: true, json: async () => ({ checkoutUrl: 'https://buy.paddle.com/test-checkout' }) }),
  });

  assert.equal(harness.elements.get('planName').textContent, 'Starter Pack');
  assert.equal(harness.elements.get('summaryCountry').textContent, 'Canada');
  assert.equal(harness.elements.get('summaryCurrency').textContent, 'CAD');
  assert.equal(harness.elements.get('pakistanMethods').classList.contains('hidden'), true);
  assert.equal(harness.elements.get('globalCheckout').classList.contains('hidden'), false);
  assert.equal(harness.elements.get('checkoutBtn').disabled, false);
  assert.match(harness.elements.get('checkoutStatus').textContent, /Checkout is ready/i);

  harness.elements.get('checkoutBtn').dispatch('click');
  assert.equal(harness.location.href, 'https://buy.paddle.com/test-checkout');
});

test('payment page keeps checkout disabled when config endpoint fails', async () => {
  const harness = await runPaymentPage({
    search: '?pack=pro&country=United%20States&currency=USD',
    fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'PAYMENT_CHECKOUT_URL is not configured' }) }),
  });

  assert.equal(harness.elements.get('checkoutBtn').disabled, true);
  assert.match(harness.elements.get('checkoutStatus').textContent, /not configured/i);
  assert.equal(harness.elements.get('globalCheckout').classList.contains('hidden'), false);
});

test('backend /api/payment-config returns configured checkout URL', async () => {
  await withServer({ PORT: '3411', PAYMENT_CHECKOUT_URL: 'https://buy.paddle.com/product/test-pack', SUCCESS_URL: '', PADDLE_API_KEY: 'test-key' }, async baseUrl => {
    const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
    assert.equal(health.checkoutConfigured, true);

    const config = await fetch(`${baseUrl}/api/payment-config`).then(response => response.json());
    assert.equal(config.checkoutUrl, 'https://buy.paddle.com/product/test-pack');
  });
});

test('backend /api/payment-config returns 404 when checkout URL is missing', async () => {
  await withServer({ PORT: '3412', PAYMENT_CHECKOUT_URL: '', SUCCESS_URL: '', PADDLE_API_KEY: 'test-key' }, async baseUrl => {
    const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
    assert.equal(health.checkoutConfigured, false);

    const response = await fetch(`${baseUrl}/api/payment-config`);
    const payload = await response.json();
    assert.equal(response.status, 404);
    assert.match(payload.error, /not configured/i);
  });
});