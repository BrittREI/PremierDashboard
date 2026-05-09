import type { VercelRequest, VercelResponse } from "@vercel/node";

const GHL_BASE = "https://services.leadconnectorhq.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.GHL_PRIVATE_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    return res.status(500).json({ error: "GHL credentials not configured" });
  }

  // Build the GHL path from the catch-all segments
  const segments = req.query.path;
  const ghlPath = Array.isArray(segments) ? segments.join("/") : segments ?? "";
  const url = new URL(`${GHL_BASE}/${ghlPath}`);

  // Forward query params, injecting locationId defaults
  const params = { ...req.query };
  delete params.path; // remove the catch-all param
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") url.searchParams.set(k, v);
  }

  try {
    const ghlRes = await fetch(url.toString(), {
      method: req.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
    });

    const data = await ghlRes.json();

    // Cache for 2 minutes on CDN, 30s in browser
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(ghlRes.status).json(data);
  } catch (err) {
    console.error("GHL proxy error:", err);
    return res.status(502).json({ error: "Failed to reach GHL API" });
  }
}
