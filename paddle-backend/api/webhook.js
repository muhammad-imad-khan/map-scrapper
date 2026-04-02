// POST /api/webhook
// Receives Paddle webhook notifications (e.g. transaction.completed).
// Auto-credits the user's account using installId from custom_data.
// Deduplicates by transaction ID so replay attacks are harmless.
const crypto = require('crypto');
const { cors, PRICE_CREDITS, addCredits, getRedis, keys, isValidInstallId } = require('./_helpers');

// ── Webhook signature verification ─────────────────────
function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  try {
    const parts = {};
    signature.split(';').forEach(p => {
      const [k, v] = p.split('=');
      parts[k] = v;
    });
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;

    const payload = `${ts}:${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Signature verification (skip if secret not set — sandbox testing) ──
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers['paddle-signature'] || '';
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!verifySignature(rawBody, sig, secret)) {
      console.warn('Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = req.body;
  const eventType = event?.event_type;
  console.log(`Webhook received: ${eventType}`);

  // We only care about completed transactions
  if (eventType !== 'transaction.completed') {
    return res.status(200).json({ received: true, event: eventType });
  }

  try {
    const txnData = event?.data;
    const txnId = txnData?.id;
    const items = txnData?.items || [];
    const installId = txnData?.custom_data?.installId;

    // ── Deduplication: reject if we already processed this transaction ──
    const redis = getRedis();
    const alreadyProcessed = await redis.get(keys.txnDedup(txnId));
    if (alreadyProcessed) {
      console.log(`Duplicate webhook for txn ${txnId}, skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // ── Validate installId from custom_data ──
    if (!isValidInstallId(installId)) {
      console.error(`Webhook missing installId in custom_data for txn: ${txnId}`);
      return res.status(200).json({ received: true, warning: 'No installId in custom_data' });
    }

    // ── Calculate credits to add ──
    let totalCredits = 0;
    let label = 'Credit Pack';

    for (const item of items) {
      const priceId = item?.price?.id;
      const match = PRICE_CREDITS[priceId];
      if (match) {
        totalCredits += match.credits * (item.quantity || 1);
        label = match.label;
      }
    }

    if (totalCredits === 0) {
      console.warn('No matching price IDs in txn:', txnId);
      return res.status(200).json({ received: true, warning: 'No matching prices' });
    }

    // ── Credit the user's account (atomic + set 7-day expiry) ──
    const result = await addCredits(installId, totalCredits, `purchase:${txnId}:${label}`);

    // ── Mark transaction as processed (dedup key, expires in 30 days) ──
    await redis.set(keys.txnDedup(txnId), JSON.stringify({
      installId,
      credits: totalCredits,
      processedAt: new Date().toISOString(),
    }), 'EX', 60 * 60 * 24 * 30);

    console.log(`Auto-credited ${totalCredits} credits to ${installId} (txn: ${txnId}). New balance: ${result.newBalance}, expires: ${new Date(result.expiresAt).toISOString()}`);

    return res.status(200).json({
      received: true,
      credited: totalCredits,
      newBalance: result.newBalance,
      expiresAt: result.expiresAt,
      installId,
    });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Internal processing error' });
  }
};
