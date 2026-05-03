/**
 * api/ghl-call-webhook.js
 * Vercel serverless function — receives GHL call webhook events, validates the
 * shared secret, and upserts the call record to Supabase (ppp_calls table).
 *
 * Required env vars (Vercel dashboard → Settings → Environment Variables):
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (NOT the anon key)
 *   GHL_WEBHOOK_SECRET        — your shared secret (used in GHL custom header)
 */

const { createClient } = require("@supabase/supabase-js");

// ── Supabase admin client ─────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ── Constant-time string comparison (prevents timing attacks) ─────────────────
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Secret validation ─────────────────────────────────────────────────────────
function isAuthorized(req) {
  const expectedSecret = process.env.GHL_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.warn("GHL_WEBHOOK_SECRET not set — webhook is unauthenticated");
    return true;
  }

  const headerSecret =
    req.headers["x-ghl-secret"] ||
    req.headers["x-highlevel-secret"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "") ||
    null;

  if (!headerSecret) return false;
  return timingSafeEqual(String(headerSecret), expectedSecret);
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    console.error("Webhook unauthorized — bad or missing x-ghl-secret header");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = req.body;

  // Log full payload in non-production for debugging
  if (process.env.NODE_ENV !== "production") {
    console.log("GHL webhook received:", JSON.stringify(payload, null, 2));
  } else {
    console.log("GHL webhook event:", payload.type, "| messageType:", payload.messageType, "| direction:", payload.direction);
  }

  // Filter: only process CALL events
  const isCallEvent = payload.messageType === "CALL";
  if (!isCallEvent) {
    return res.status(200).json({ received: true, processed: false, reason: `Not a CALL event (messageType=${payload.messageType})` });
  }

  // GHL workflow payloads nest contact under payload.contact.id
  // Native webhook payloads use top-level payload.contactId
  const contactId = payload.contactId || payload.contact?.id || payload.contact_id || null;

  if (!contactId) {
    // Still store the raw payload so we can inspect what GHL is actually sending
    console.error("Webhook missing contactId — raw payload:", JSON.stringify(payload));
    return res.status(400).json({ error: "Missing contactId in payload", raw: payload });
  }

  // Normalize direction — may be top-level or nested under payload.call
  const rawDirection = (payload.direction || payload.call?.direction || "").toLowerCase();
  const direction = rawDirection.includes("inbound") ? "inbound" : "outbound";

  // callDuration may be a number (native webhook) or string (workflow template)
  const callDuration = parseInt(payload.callDuration ?? payload.call?.duration ?? 0, 10) || 0;

  // Normalize call status to lowercase
  const callStatus = (payload.callStatus || payload.call?.status || "unknown")
    .toLowerCase().replace(/\s+/g, "-");

  const record = {
    ghl_message_id:        payload.messageId                           || null,
    contact_id:            contactId,
    conversation_id:       payload.conversationId                      || null,
    location_id:           payload.locationId                          || null,
    direction,
    call_status:           callStatus,
    call_duration_seconds: callDuration,
    from_number:           payload.from || payload.call?.from          || null,
    to_number:             payload.to   || payload.call?.to            || null,
    date_added:            payload.dateAdded
                             ? new Date(payload.dateAdded).toISOString()
                             : new Date().toISOString(),
    raw_payload:           payload,
  };

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("ppp_calls")
      .upsert(record, { onConflict: "ghl_message_id", ignoreDuplicates: false });

    if (error) {
      console.error("Supabase upsert error:", error);
      return res.status(500).json({ error: "Database error", detail: error.message });
    }

    console.log(`Saved: ${record.direction} | ${record.call_status} | ${record.call_duration_seconds}s | contact=${record.contact_id}`);
    return res.status(200).json({ received: true, processed: true });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook handler error:", message);
    return res.status(500).json({ error: "Internal server error", detail: message });
  }
};
