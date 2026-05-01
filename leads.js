/**
 * /api/leads — Lead management KPIs for Premier Path Properties
 *
 * Pulls conversations (calls) + contacts from GHL and returns aggregated
 * KPI data for the leads.html dashboard page.
 *
 * Env vars (same as api/deals.js):
 *   GHL_API_KEY      — Private Integration token
 *   GHL_LOCATION_ID  — Sub-account location ID
 */

const BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };
}

/** Fetch N pages of conversations (sorted by last message date desc) */
async function fetchConversations(locationId, h, maxPages = 10) {
  let all = [];
  let lastId = null;

  for (let page = 0; page < maxPages; page++) {
    let url = `${BASE}/conversations/?locationId=${locationId}&limit=100&sort=desc&sortBy=last_message_date`;
    if (lastId) url += `&lastId=${lastId}`;

    const resp = await fetch(url, { headers: h });
    if (!resp.ok) break;

    const data = await resp.json();
    const batch = data.conversations || [];
    if (!batch.length) break;

    all = all.concat(batch);

    // Stop if we've gone back more than 90 days
    const oldest = batch[batch.length - 1];
    const oldestTs = oldest.lastMessageDate || oldest.dateAdded || 0;
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    if (oldestTs < ninetyDaysAgo) break;

    lastId = oldest.id;
    if (batch.length < 100) break;
  }

  return all;
}

/** Fetch all users for the location */
async function fetchUsers(locationId, h) {
  try {
    const resp = await fetch(`${BASE}/users/?locationId=${locationId}`, { headers: h });
    if (!resp.ok) return {};
    const data = await resp.json();
    const map = {};
    for (const u of (data.users || [])) {
      map[u.id] = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id;
    }
    return map;
  } catch (_) {
    return {};
  }
}

/** Get total contacts with a given tag */
async function getTagCount(locationId, h, tag) {
  try {
    const resp = await fetch(
      `${BASE}/contacts/?locationId=${locationId}&limit=1&tags[]=${encodeURIComponent(tag)}`,
      { headers: h }
    );
    if (!resp.ok) return 0;
    const d = await resp.json();
    return d.meta?.total || (d.contacts?.length ?? 0);
  } catch (_) {
    return 0;
  }
}

/** Fetch recent contacts (up to 500) to derive source breakdown */
async function fetchRecentContacts(locationId, h, pages = 5) {
  let all = [];
  let startAfterId = null;

  for (let i = 0; i < pages; i++) {
    let url = `${BASE}/contacts/?locationId=${locationId}&limit=100&sortBy=date_added&sort=desc`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;

    const resp = await fetch(url, { headers: h });
    if (!resp.ok) break;
    const data = await resp.json();
    const batch = data.contacts || [];
    if (!batch.length) break;

    all = all.concat(batch);
    const meta = data.meta || {};
    startAfterId = meta.startAfterId || null;
    if (!startAfterId || batch.length < 100) break;
  }

  return all;
}

/** Build a YYYY-MM-DD string from a timestamp (ms) */
function toDateStr(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Last N days as YYYY-MM-DD array (most recent last) */
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// Tags that signal a lead acquisition channel (order matters — first match wins)
const SOURCE_TAGS = [
  { label: 'Direct Mail',    matches: ['dm force', 'direct mail', 'mail', 'mailer'] },
  { label: 'Cold Call',      matches: ['cold call', 'cold calling', 'outbound call'] },
  { label: 'PPC / Google',   matches: ['ppc', 'google', 'adwords', 'paid search'] },
  { label: 'Facebook / IG',  matches: ['facebook', 'fb', 'instagram', 'ig', 'social', 'meta'] },
  { label: 'SMS Blast',      matches: ['sms blast', 'sms', 'text blast'] },
  { label: 'Driving 4 $',    matches: ['driving', 'd4d', 'driving for dollars'] },
  { label: 'Referral',       matches: ['referral', 'refer'] },
  { label: 'Website',        matches: ['website', 'web', 'organic', 'seo'] },
  { label: 'HS Import',      matches: ['hs import', 'hubspot'] },
];

function classifySource(tags) {
  const normalized = (tags || []).map(t => t.toLowerCase());
  for (const { label, matches } of SOURCE_TAGS) {
    if (matches.some(m => normalized.some(t => t.includes(m)))) return label;
  }
  return 'Other / Unknown';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return res.status(500).json({ error: 'GHL_API_KEY and GHL_LOCATION_ID env vars required.' });
  }

  const h = ghlHeaders(apiKey);

  try {
    // ── Fetch data in parallel ───────────────────────────────────────────────
    const [conversations, userMap, missedCallTotal, recentContacts] = await Promise.all([
      fetchConversations(locationId, h, 10),   // last ~1000 convs / 90 days
      fetchUsers(locationId, h),
      getTagCount(locationId, h, 'missed call'),
      fetchRecentContacts(locationId, h, 5),   // last 500 contacts for source breakdown
    ]);

    // ── Filter to call conversations ─────────────────────────────────────────
    const callConvs = conversations.filter(c => c.lastMessageType === 'TYPE_CALL');
    const inboundCalls  = callConvs.filter(c => c.lastMessageDirection === 'inbound');
    const outboundCalls = callConvs.filter(c => c.lastMessageDirection === 'outbound');

    // ── Missed calls: prefer tag-based total, fall back to body-pattern scan ─
    // Also identify missed within our fetched conversations (for by-user breakdown)
    const MISSED_PATTERNS = [/missed/i, /no answer/i, /voicemail/i, /left vm/i, /ghost call/i];
    function looksLikeMissed(conv) {
      if ((conv.tags || []).some(t => t.toLowerCase().includes('missed'))) return true;
      const body = (conv.lastMessageBody || conv.lastInternalComment || '').toLowerCase();
      return MISSED_PATTERNS.some(p => p.test(body));
    }
    const missedConvs = inboundCalls.filter(looksLikeMissed);

    // ── By-user aggregation ──────────────────────────────────────────────────
    const userStats = {};
    for (const c of inboundCalls) {
      const uid = c.assignedTo || 'unassigned';
      if (!userStats[uid]) userStats[uid] = { userId: uid, name: userMap[uid] || 'Unassigned', inbound: 0, missed: 0 };
      userStats[uid].inbound++;
      if (looksLikeMissed(c)) userStats[uid].missed++;
    }
    const byUser = Object.values(userStats)
      .map(u => ({ ...u, answered: u.inbound - u.missed, answerRate: u.inbound ? (u.inbound - u.missed) / u.inbound : 0 }))
      .sort((a, b) => b.inbound - a.inbound);

    // ── 14-day daily call trend ──────────────────────────────────────────────
    const days14 = lastNDays(14);
    const cutoff14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const dayMap = Object.fromEntries(days14.map(d => [d, { inbound: 0, missed: 0, outbound: 0 }]));

    for (const c of callConvs) {
      const ts = c.lastMessageDate || c.dateAdded || 0;
      if (ts < cutoff14) continue;
      const day = toDateStr(ts);
      if (!dayMap[day]) continue;
      if (c.lastMessageDirection === 'inbound') {
        dayMap[day].inbound++;
        if (looksLikeMissed(c)) dayMap[day].missed++;
      } else {
        dayMap[day].outbound++;
      }
    }
    const trend = days14.map(d => ({ date: d, ...dayMap[d] }));

    // ── Source breakdown from recent contacts ────────────────────────────────
    const sourceCounts = {};
    for (const contact of recentContacts) {
      // Prefer GHL's built-in source field, fall back to tag classification
      const src = contact.source || classifySource(contact.tags);
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }
    const bySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Channel mix: all conversation types in window ────────────────────────
    const typeCounts = {};
    for (const c of conversations) {
      const t = c.lastMessageType || 'UNKNOWN';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    const answeredCalls = inboundCalls.length - missedConvs.length;

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      window: { conversations: conversations.length, days: 90 },
      calls: {
        total: callConvs.length,
        inbound: inboundCalls.length,
        outbound: outboundCalls.length,
        missed: missedCallTotal || missedConvs.length,
        answered: answeredCalls,
        answerRate: inboundCalls.length ? answeredCalls / inboundCalls.length : 0,
      },
      byUser,
      trend,
      bySource,
      channelMix: Object.entries(typeCounts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    });

  } catch (err) {
    console.error('[leads] handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
