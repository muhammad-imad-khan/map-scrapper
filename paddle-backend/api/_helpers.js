// ── Shared Paddle helpers ────────────────────────────────
const Redis = require('ioredis');
const crypto = require('crypto');

const PADDLE_ENV = process.env.PADDLE_ENV || 'sandbox';

const BASE_URL = PADDLE_ENV === 'live'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com';

const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';

const FREE_STARTER_CREDITS = 25;

// Map price IDs → credit amounts
const PRICE_CREDITS = {
  [process.env.PRICE_STARTER || 'pri_01kkwtvthhty0fks2hrc68cb52']: { credits: 100,  label: 'Starter Pack' },
  [process.env.PRICE_PRO     || 'pri_01kkwtx0kh2skzrzjbxgmgqngd']: { credits: 500,  label: 'Pro Pack' },
  [process.env.PRICE_AGENCY  || 'pri_01kkwtyfwvrwspy654f56h4n5d']: { credits: 1000, label: 'Agency Pack' },
};

// ── Redis singleton ───────────────────────────────────────
let _redis;
function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    });
    _redis.connect().catch(() => {});
  }
  return _redis;
}

// ── Key helpers (RLS: each user scoped by installId) ──────
const keys = {
  credits:   (id) => `credits:${id}`,
  txnLog:    (id) => `txnlog:${id}`,
  txnDedup:  (txnId) => `txn:${txnId}`,
  install:   (id) => `install:${id}`,
};

// ── Credit operations (all server-side, atomic) ───────────
async function getCredits(installId) {
  const redis = getRedis();
  const val = await redis.get(keys.credits(installId));
  return val !== null ? parseInt(val, 10) : null;
}

async function initUser(installId) {
  const redis = getRedis();
  const existing = await redis.get(keys.credits(installId));
  if (existing !== null) return parseInt(existing, 10);
  // New user: grant starter credits
  await redis.set(keys.credits(installId), FREE_STARTER_CREDITS);
  await redis.set(keys.install(installId), JSON.stringify({
    createdAt: new Date().toISOString(),
  }));
  return FREE_STARTER_CREDITS;
}

async function addCredits(installId, amount, reason) {
  const redis = getRedis();
  const newBal = await redis.incrby(keys.credits(installId), amount);
  await redis.rpush(keys.txnLog(installId), JSON.stringify({
    type: 'credit', amount, reason, balance: newBal, at: new Date().toISOString(),
  }));
  return newBal;
}

async function deductCredits(installId, amount) {
  const redis = getRedis();
  // Lua script for atomic deduct-if-sufficient
  const lua = `
    local cur = tonumber(redis.call('get', KEYS[1]) or 0)
    local cost = tonumber(ARGV[1])
    if cur >= cost then
      redis.call('decrby', KEYS[1], cost)
      return cur - cost
    else
      return -1
    end
  `;
  const result = await redis.eval(lua, 1, keys.credits(installId), amount);
  return parseInt(result, 10);
}

// ── Validate installId format ─────────────────────────────
function isValidInstallId(id) {
  return typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Install-Id');
}

async function paddleRequest(path, body) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

module.exports = {
  PADDLE_ENV, BASE_URL, PADDLE_API_KEY, PRICE_CREDITS, FREE_STARTER_CREDITS,
  cors, paddleRequest, getRedis, keys,
  getCredits, initUser, addCredits, deductCredits, isValidInstallId,
};
