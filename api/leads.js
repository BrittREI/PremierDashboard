/**
 * /api/leads — Lead management KPIs for Premier Path Properties
 * Env vars: GHL_API_KEY, GHL_LOCATION_ID
 */

const BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };
}

async function ghlFetch(url, h) {
  const resp = await fetch(url, { headers: h });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { _raw: text }; }
  return { status: resp.status, ok: resp.ok, json };
}

/** Fetch conversations, exposing errors in return value */
async function fetchConversations(locationId, h, maxPages = 15) {
  let all = [];
  let lastId = null;
  const errors = [];
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (let page = 0; page < maxPages; page++) {
    let url = `${BASE}/conversations/search?locationId=${locationId}&limit=20`;
    if (lastId) url += `&lastId=${lastId}`;

    const { status, ok, json } = await ghlFetch(url, h);

    if (!ok) {
      errors.push({ url, status, body: json });
      break;
    }

    const batch = json.conversations || [];
    if (!batch.length) break;

    all = all.concat(batch);

    const oldest = batch[batch.length - 1];
    const oldestTs = oldest.lastMessageDate || oldest.dateAdded || 0;
    if (oldestTs < ninetyDaysAgo) break;

    lastId = oldest.id;
    if (batch.length < 20) break;
  }

  return { conversations: all, errors };
}

/** Fetch GHL users → id:name map */
async function fetchUsers(locationId, h) {
  try {
    const { ok, json } = await ghlFetch(`${BASE}/users/?locationId=${locationId}`, h);
    if (!ok) return { map: {}, error: json };
    const map = {};
    for (const u of (json.users || [])) {
      map[u.id] = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id;
    }
    return { map, error: null };
  } catch (e) {
    return { map: {}, error: e.message };
  }
}

/** Get total contact count */
async function getContactCount(locationId, h, tag) {
  try {
    let url = `${BASE}/contacts/?locationId=${locationId}&limit=1`;
    if (tag) url += `&tags[]=${encodeURIComponent(tag)}`;
    const { ok, json } = await ghlFetch(url, h);
    if (!ok) return { count: 0, error: json };
    return { count: json.meta?.total ?? json.total ?? 0, error: null };
  } catch (e) {
    return { count: 0, error: e.message };
  }
}

/** Fetch recent contacts for source breakdown */
async function fetchRecentContacts(locationId, h, pages = 5) {
  let all = [];
  let startAfterId = null;
  const errors = [];

  for (let i = 0; i < pages; i++) {
    let url = `${BASE}/contacts/?locationId=${locationId}&limit=100&sortBy=date_added&sort=desc`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;

    const { ok, json } = await ghlFetch(url, h);
    if (!ok) { errors.push(json); break; }

    const batch = json.contacts || [];
    if (!batch.length) break;

    all = all.concat(batch);
    startAfterId = json.meta?.startAfterId ?? null;
    if (!startAfterId || batch.length < 100) break;
  }

  return { contacts: all, errors };
}

function toDateStr(ts) { return new Date(ts).toISOString().slice(0, 10); }

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const SOURCE_TAGS = [
  { label: 'Direct Mail',   matches: ['dm force', 'direct mail', 'mail', 'mailer'] },
  { label: 'Cold Call',     matches: ['cold call', 'cold calling'] },
  { label: 'PPC / Google',  matches: ['ppc', 'google', 'adwords'] },
  { label: 'Facebook / IG', matches: ['facebook', 'fb', 'instagram', 'ig', 'social', 'meta'] },
  { label: 'SMS Blast',     matches: ['sms blast', 'text blast'] },
  { label: 'Driving 4 $',   matches: ['driving', 'd4d'] },
  { label: 'Referral',      matches: ['referral', 'refer'] },
  { label: 'Website',       matches: ['website', 'web', 'organic', 'seo'] },
  { label: 'HS Import',     matches: ['hs import', 'hubspot'] },
];

function classifySource(tags) {
  const n = (tags || []).map(t => t.toLowerCase());
  for (const { label, matches } of SOURCE_TAGS) {
    if (matches.some(m => n.some(t => t.includes(m)))) return label;
  }
  return 'Other / Unknown';
}

const MISSED_PATTERNS = [/missed/i, /no answer/i, /voicemail/i, /left vm/i, /ghost call/i];
function looksLikeMissed(conv) {
  if ((conv.tags || []).some(t => /missed/i.test(t))) return true;
  const body = `${conv.lastMessageBody || ''} ${conv.lastInternalComment || ''}`.toLowerCase();
  return MISSED_PATTERNS.some(p => p.test(body));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return res.status(500).json({ error: 'GHL_API_KEY and GHL_LOCATION_ID env vars required.' });
  }

  const h = ghlHeaders(apiKey);

  try {
    const [
      { conversations, errors: convErrors },
      { map: userMap, error: userError },
      { count: missedCallTotal },
      { contacts: recentContacts, errors: contactErrors },
    ] = await Promise.all([
      fetchConversations(locationId, h, 15),
      fetchUsers(locationId, h),
      getContactCount(locationId, h, 'missed call'),
      fetchRecentContacts(locationId, h, 5),
    ]);

    // ── Call filtering ───────────────────────────────────────────────────────
    const callConvs     = conversations.filter(c => c.lastMessageType === 'TYPE_CALL');
    const inboundCalls  = callConvs.filter(c => c.lastMessageDirection === 'inbound');
    const outboundCalls = callConvs.filter(c => c.lastMessageDirection === 'outbound');
    const missedConvs   = inboundCalls.filter(looksLikeMissed);
    const answeredCalls = inboundCalls.length - missedConvs.length;

    // ── By-user aggregation ──────────────────────────────────────────────────
    const userStats = {};
    for (const c of inboundCalls) {
      const uid = c.assignedTo || 'unassigned';
      if (!userStats[uid]) userStats[uid] = { userId: uid, name: userMap[uid] || uid, inbound: 0, missed: 0 };
      userStats[uid].inbound++;
      if (looksLikeMissed(c)) userStats[uid].missed++;
    }
    const byUser = Object.values(userStats)
      .map(u => ({ ...u, answered: u.inbound - u.missed, answerRate: u.inbound ? (u.inbound - u.missed) / u.inbound : 0 }))
      .sort((a, b) => b.inbound - a.inbound);

    // ── 14-day trend ─────────────────────────────────────────────────────────
    const days14   = lastNDays(14);
    const cutoff14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const dayMap   = Object.fromEntries(days14.map(d => [d, { inbound: 0, missed: 0, outbound: 0 }]));

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

    // ── Source breakdown ─────────────────────────────────────────────────────
    const sourceCounts = {};
    for (const contact of recentContacts) {
      const src = contact.source || classifySource(contact.tags);
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }
    const bySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Channel mix ──────────────────────────────────────────────────────────
    const typeCounts = {};
    for (const c of conversations) {
      const t = c.lastMessageType || 'UNKNOWN';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    // ── Build response (include _errors so frontend can show warnings) ────────
    const _errors = [
      ...(convErrors.length    ? [{ source: 'conversations', details: convErrors }] : []),
      ...(contactErrors.length ? [{ source: 'contacts',      details: contactErrors }] : []),
      ...(userError            ? [{ source: 'users',         details: userError }] : []),
    ];

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
      ..._errors.length ? { _errors } : {},
    });

  } catch (err) {
    console.error('[leads] handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
