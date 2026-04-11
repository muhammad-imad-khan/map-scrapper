const fs = require('fs');
const path = require('path');

const BACKEND_BASE = 'https://leadgenx-api.vercel.app';
const ZIP_NAME = 'maps-scraper-extension-v1.0.zip';
const ZIP_PATH = path.join(__dirname, '_assets', ZIP_NAME);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id');
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readBody(req);
  const token = (body.token || '').toString().trim();
  const clientId = (body.clientId || req.headers['x-client-id'] || '').toString().trim();

  try {
    const pricingResp = await fetch(`${BACKEND_BASE}/api/pricing-config`, { cache: 'no-store' });
    const pricingData = pricingResp.ok ? await pricingResp.json() : { mode: 'credit_based' };
    const pricingMode = pricingData && pricingData.mode ? pricingData.mode : 'credit_based';

    if (pricingMode === 'one_time') {
      if (!token) {
        return res.status(401).json({ error: 'Complete the lifetime purchase to download the extension.' });
      }

      const authResp = await fetch(`${BACKEND_BASE}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clientId,
          'User-Agent': (req.headers['user-agent'] || '').toString(),
          'Accept-Language': (req.headers['accept-language'] || '').toString(),
          'sec-ch-ua': (req.headers['sec-ch-ua'] || '').toString(),
          'sec-ch-ua-platform': (req.headers['sec-ch-ua-platform'] || '').toString(),
        },
        body: JSON.stringify({ action: 'me', token, clientId }),
      });
      const authData = await authResp.json().catch(() => ({}));
      if (!authResp.ok) {
        return res.status(authResp.status || 401).json({ error: authData.error || 'Please sign in again.' });
      }
      if (!authData.entitlements || authData.entitlements.zipDownload !== true) {
        return res.status(403).json({ error: 'Download unlocks after your lifetime purchase is completed.' });
      }
    }

    if (!fs.existsSync(ZIP_PATH)) {
      return res.status(404).json({ error: 'Extension package not found.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${ZIP_NAME}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    fs.createReadStream(ZIP_PATH).pipe(res);
  } catch (err) {
    console.error('download-extension error:', err);
    return res.status(500).json({ error: 'Download unavailable right now.' });
  }
};