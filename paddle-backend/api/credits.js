// GET/POST /api/credits
// GET  → returns current balance for installId
// POST → deducts credits (called by extension during scraping)
//
// Security: installId is a UUID generated client-side on first install.
// All credit mutations happen server-side with atomic Redis operations.
const { cors, isValidInstallId, getCredits, initUser, deductCredits, sendInstallNotification } = require('./_helpers');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const installId = req.headers['x-install-id'] || req.query.installId;
  if (!isValidInstallId(installId)) {
    return res.status(400).json({ error: 'Missing or invalid installId' });
  }

  // GET → fetch balance (init user if first time)
  if (req.method === 'GET') {
    try {
      const result = await initUser(installId);
      if (result.isNew) {
        sendInstallNotification({ installId }).catch(() => {});
      }
      return res.status(200).json({
        credits: result.credits,
        installId,
        expired: result.expired,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      console.error('Credits GET error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST → deduct credits (for scraping)
  if (req.method === 'POST') {
    const { amount } = req.body || {};
    const cost = parseInt(amount, 10) || 1;
    if (cost < 1 || cost > 100) {
      return res.status(400).json({ error: 'Invalid amount (1-100)' });
    }

    try {
      // Check expiry before deducting
      const current = await getCredits(installId);
      if (current.expired || current.credits === 0) {
        return res.status(402).json({ error: 'Credits expired', credits: 0, expired: true });
      }

      const newBal = await deductCredits(installId, cost);
      if (newBal < 0) {
        return res.status(402).json({ error: 'Insufficient credits', credits: current.credits || 0 });
      }
      return res.status(200).json({ credits: newBal, deducted: cost, expiresAt: current.expiresAt });
    } catch (err) {
      console.error('Credits POST error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
