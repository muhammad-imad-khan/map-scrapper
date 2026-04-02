// POST /api/checkout
// Creates a Paddle transaction and returns the checkout URL.
// Body: { priceId: "pri_...", installId: "uuid" }
// The installId is stored as custom_data so the webhook knows who to credit.
const { cors, paddleRequest, PADDLE_API_KEY, isValidInstallId, initUser } = require('./_helpers');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!PADDLE_API_KEY) {
    return res.status(500).json({ error: 'PADDLE_API_KEY not configured' });
  }

  const { priceId, installId } = req.body || {};
  if (!priceId || !priceId.startsWith('pri_')) {
    return res.status(400).json({ error: 'Missing or invalid priceId' });
  }
  if (!isValidInstallId(installId)) {
    return res.status(400).json({ error: 'Missing or invalid installId' });
  }

  // Ensure user exists in Redis before checkout
  await initUser(installId);

  try {
    // Create a transaction via Paddle API with custom_data containing installId
    const data = await paddleRequest('/transactions', {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { installId },
    });

    if (data?.data?.checkout?.url) {
      return res.status(200).json({ checkoutUrl: data.data.checkout.url });
    }

    if (data?.data?.id) {
      const txnId = data.data.id;
      const checkoutDomain = process.env.PADDLE_ENV === 'live'
        ? 'https://checkout.paddle.com'
        : 'https://sandbox-checkout.paddle.com';
      return res.status(200).json({ checkoutUrl: `${checkoutDomain}/transaction/${txnId}` });
    }

    console.error('Paddle /transactions response:', JSON.stringify(data));
    return res.status(502).json({ error: 'Could not create checkout', detail: data?.error?.detail || 'Unknown' });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
