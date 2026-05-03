/**
 * /api/debug — GHL connectivity check for Premier Path Properties
 * Hit this endpoint to see exactly what each GHL API call returns.
 * DELETE this file before going to production.
 */

const BASE = 'https://services.leadconnectorhq.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return res.status(500).json({ error: 'Missing GHL_API_KEY or GHL_LOCATION_ID env vars' });
  }

  const h = {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  async function probe(label, url, opts = {}) {
    try {
      const r = await fetch(url, { headers: h, ...opts });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch (_) { json = null; }
      return {
        label,
        status: r.status,
        ok: r.ok,
        // Show top-level keys and counts so we can see what came back
        summary: json ? Object.fromEntries(
          Object.entries(json).map(([k, v]) => [
            k,
            Array.isArray(v) ? `[${v.length} items]` : (typeof v === 'object' && v !== null ? '{...}' : v)
          ])
        ) : text.slice(0, 300),
      };
    } catch (e) {
      return { label, status: 'EXCEPTION', ok: false, summary: e.message };
    }
  }

  const results = await Promise.all([
    probe('whoami / location',
      `${BASE}/locations/${locationId}`),

    probe('contacts (first 5)',
      `${BASE}/contacts/?locationId=${locationId}&limit=5`),

    probe('conversations/search (no sort)',
      `${BASE}/conversations/search?locationId=${locationId}&limit=5`),

    probe('conversations/search (with sort)',
      `${BASE}/conversations/search?locationId=${locationId}&limit=5&sort=desc&sortBy=last_message_date`),

    probe('conversations/ (trailing slash)',
      `${BASE}/conversations/?locationId=${locationId}&limit=5`),

    probe('opportunities/search',
      `${BASE}/opportunities/search?location_id=${locationId}&limit=5`),

    probe('users',
      `${BASE}/users/?locationId=${locationId}`),
  ]);

  return res.status(200).json({
    env: {
      GHL_API_KEY: apiKey ? `set (${apiKey.length} chars, starts: ${apiKey.slice(0,6)}...)` : 'MISSING',
      GHL_LOCATION_ID: locationId || 'MISSING',
    },
    results,
  });
}
