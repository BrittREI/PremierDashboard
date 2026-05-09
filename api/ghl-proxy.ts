import type { VercelRequest, VercelResponse } from "@vercel/node";

const GHL_BASE = "https://services.leadconnectorhq.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.GHL_PRIVATE_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    return res.status(500).json({
      error: "GHL credentials not configured",
      hasToken: !!token,
      hasLocation: !!locationId,
    });
  }

  // Build the GHL path from the "path" query param (set by Vercel rewrite)
  const rawPath = req.query.path;
  const ghlPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath ?? "";
  const url = new URL(`${GHL_BASE}/${ghlPath}`);

  // Forward remaining query params (exclude "path" which is the rewrite key)
  const params = { ...req.query };
  delete params.path;
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v !== "") url.searchParams.set(k, v);
  }

  // Inject locationId if not already set (server-side injection)
  if (!url.searchParams.has("locationId") && !url.searchParams.has("location_id")) {
    if (ghlPath.includes("opportunities/search")) {
      url.searchParams.set("location_id", locationId);
    } else {
      url.searchParams.set("locationId", locationId);
    }
  }
  // Fill in empty locationId/location_id with server value
  if (url.searchParams.get("locationId") === "") {
    url.searchParams.set("locationId", locationId);
  }
  if (url.searchParams.get("location_id") === "") {
    url.searchParams.set("location_id", locationId);
  }

  // For POST requests, inject locationId into body
  let body: string | undefined;
  if (req.method === "POST" && req.body) {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed.locationId) {
      parsed.locationId = locationId;
    }
    body = JSON.stringify(parsed);
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
      body,
    });

    const data = await ghlRes.json();

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(ghlRes.status).json(data);
  } catch (err) {
    console.error("GHL proxy error:", err);
    return res.status(502).json({ error: "Failed to reach GHL API" });
  }
}
