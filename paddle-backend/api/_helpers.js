// ── Shared Paddle helpers ────────────────────────────────
const Redis = require('ioredis');
const crypto = require('crypto');

const PADDLE_ENV = process.env.PADDLE_ENV || 'sandbox';

const BASE_URL = PADDLE_ENV === 'live'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com';

const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';

const FREE_STARTER_CREDITS = 25;
const CREDITS_EXPIRY_DAYS = 7;

// Two paid tiers — each maps priceId → credits + tier label
const PRICE_CREDITS = {
  [process.env.PRICE_PRO || 'pri_01kkwtx0kh2skzrzjbxgmgqngd']:        { credits: 500,  label: 'Pro Pack',        tier: 'pro' },
  [process.env.PRICE_ENTERPRISE || 'pri_enterprise_placeholder']:       { credits: 1000, label: 'Enterprise Pack',  tier: 'enterprise' },
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
  expiry:    (id) => `expiry:${id}`,
  tier:      (id) => `tier:${id}`,
  txnLog:    (id) => `txnlog:${id}`,
  txnDedup:  (txnId) => `txn:${txnId}`,
  install:   (id) => `install:${id}`,
};

// ── Credit operations (all server-side, atomic) ───────────
async function getCredits(installId) {
  const redis = getRedis();
  // Check expiry first — if expired, wipe credits and reset tier
  const expiry = await redis.get(keys.expiry(installId));
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    await redis.set(keys.credits(installId), 0);
    await redis.del(keys.expiry(installId));
    await redis.set(keys.tier(installId), 'free');
    return { credits: 0, expired: true, expiresAt: null, tier: 'free' };
  }
  const val = await redis.get(keys.credits(installId));
  const tier = await redis.get(keys.tier(installId)) || 'free';
  return {
    credits: val !== null ? parseInt(val, 10) : null,
    expired: false,
    expiresAt: expiry ? parseInt(expiry, 10) : null,
    tier,
  };
}

async function initUser(installId) {
  const redis = getRedis();
  const existing = await redis.get(keys.credits(installId));
  if (existing !== null) {
    // Check expiry
    const expiry = await redis.get(keys.expiry(installId));
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      await redis.set(keys.credits(installId), 0);
      await redis.del(keys.expiry(installId));
      await redis.set(keys.tier(installId), 'free');
      return { credits: 0, expired: true, expiresAt: null, tier: 'free' };
    }
    const tier = await redis.get(keys.tier(installId)) || 'free';
    return {
      credits: parseInt(existing, 10),
      expired: false,
      expiresAt: expiry ? parseInt(expiry, 10) : null,
      tier,
    };
  }
  // New user: grant starter credits (no expiry on free credits)
  await redis.set(keys.credits(installId), FREE_STARTER_CREDITS);
  await redis.set(keys.tier(installId), 'free');
  await redis.set(keys.install(installId), JSON.stringify({
    createdAt: new Date().toISOString(),
  }));
  return { credits: FREE_STARTER_CREDITS, expired: false, expiresAt: null, tier: 'free' };
}

async function addCredits(installId, amount, reason, tier) {
  const redis = getRedis();
  const newBal = await redis.incrby(keys.credits(installId), amount);
  // Set 7-day expiry from now (resets on each purchase)
  const expiresAt = Date.now() + CREDITS_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  await redis.set(keys.expiry(installId), expiresAt);
  // Upgrade tier (only upward: free → pro → enterprise)
  if (tier) {
    const current = await redis.get(keys.tier(installId)) || 'free';
    const rank = { free: 0, pro: 1, enterprise: 2 };
    if ((rank[tier] || 0) >= (rank[current] || 0)) {
      await redis.set(keys.tier(installId), tier);
    }
  }
  const finalTier = await redis.get(keys.tier(installId)) || 'free';
  await redis.rpush(keys.txnLog(installId), JSON.stringify({
    type: 'credit', amount, reason, balance: newBal, tier: finalTier, expiresAt, at: new Date().toISOString(),
  }));
  return { newBalance: newBal, expiresAt, tier: finalTier };
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
  PADDLE_ENV, BASE_URL, PADDLE_API_KEY, PRICE_CREDITS, FREE_STARTER_CREDITS, CREDITS_EXPIRY_DAYS,
  cors, paddleRequest, getRedis, keys,
  getCredits, initUser, addCredits, deductCredits, isValidInstallId,
};

