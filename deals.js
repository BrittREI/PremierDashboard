/**
 * /api/deals — GHL data layer for Premier Path Properties
 *
 * Env vars required:
 *   GHL_API_KEY      — Private Integration token from GHL Settings → Integrations
 *   GHL_LOCATION_ID  — Sub-account location ID
 *
 * Optional (for buyerPrice / listPrice custom fields):
 *   GHL_BUYER_PRICE_FIELD_ID   — GHL custom field ID for buyer/assigned price
 *   GHL_LIST_PRICE_FIELD_ID    — GHL custom field ID for list/dispo price
 *
 * Response shape is identical to the original HubSpot implementation so the
 * frontend requires no changes.
 */

const BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };
}

/** Fetch all opportunities with cursor pagination */
async function fetchAllOpportunities(locationId, h) {
  let all = [];
  let startAfterId = null;

  for (let page = 0; page < 50; page++) {
    let url = `${BASE}/opportunities/search?location_id=${locationId}&limit=100`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;

    const resp = await fetch(url, { headers: h });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || `GHL opportunities error ${resp.status}`);
    }
    const data = await resp.json();
    const batch = data.opportunities || [];
    all = all.concat(batch);

    const next = data.meta?.startAfterId;
    if (!next || batch.length < 100) break;
    startAfterId = next;
  }

  return all;
}

/** Fetch pipeline stage → name map */
async function fetchStageMap(locationId, h) {
  const resp = await fetch(`${BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: h });
  if (!resp.ok) return {};
  const data = await resp.json();
  const map = {};
  for (const pipe of (data.pipelines || [])) {
    for (const s of (pipe.stages || [])) {
      map[s.id] = s.name;
    }
  }
  return map;
}

/**
 * Discover custom field IDs for buyerPrice / listPrice.
 * Falls back to env vars GHL_BUYER_PRICE_FIELD_ID / GHL_LIST_PRICE_FIELD_ID.
 */
async function fetchCustomFieldIds(locationId, h) {
  // Allow explicit override via env vars
  if (process.env.GHL_BUYER_PRICE_FIELD_ID || process.env.GHL_LIST_PRICE_FIELD_ID) {
    return {
      buyerFieldId: process.env.GHL_BUYER_PRICE_FIELD_ID || null,
      listFieldId: process.env.GHL_LIST_PRICE_FIELD_ID || null,
    };
  }

  try {
    const resp = await fetch(
      `${BASE}/custom-fields/?locationId=${locationId}&model=opportunity`,
      { headers: h }
    );
    if (!resp.ok) return { buyerFieldId: null, listFieldId: null };
    const data = await resp.json();

    let buyerFieldId = null;
    let listFieldId = null;

    for (const f of (data.customFields || [])) {
      const key = (f.fieldKey || f.name || '').toLowerCase();
      if (!buyerFieldId && (key.includes('assign') || key.includes('buyer'))) {
        buyerFieldId = f.id;
      }
      if (!listFieldId && (key.includes('dispo') || key.includes('list'))) {
        listFieldId = f.id;
      }
    }

    return { buyerFieldId, listFieldId };
  } catch (_) {
    return { buyerFieldId: null, listFieldId: null };
  }
}

/** Get contact count for a time window (returns 0 on failure) */
async function getContactCount(locationId, h, afterDate, beforeDate) {
  try {
    const filters = [];
    if (afterDate) filters.push({ field: 'dateAdded', operator: 'gte', value: afterDate });
    if (beforeDate) filters.push({ field: 'dateAdded', operator: 'lt', value: beforeDate });

    const body = {
      locationId,
      page: 1,
      pageLimit: 1,
      ...(filters.length ? { filters } : {}),
    };

    const r = await fetch(`${BASE}/contacts/search`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    const d = await r.json();
    return d.total || d.count || (d.contacts ? d.contacts.length : 0) || 0;
  } catch (_) {
    return 0;
  }
}

/** Extract a numeric value from GHL customFields array */
function customFieldValue(opp, fieldId) {
  if (!fieldId) return 0;
  const cf = (opp.customFields || []).find(f => f.id === fieldId);
  if (!cf) return 0;
  return parseFloat(cf.fieldValueString ?? cf.fieldValue ?? cf.value ?? 0) || 0;
}

const EXCLUDED_STAGES = new Set(['Appointment scheduled']);

const YEAR_RANGES = {
  2024: ['2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
  2025: ['2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  2026: ['2026-01-01T00:00:00.000Z', null],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return res.status(500).json({
      error: 'GHL_API_KEY and GHL_LOCATION_ID environment variables are required.',
    });
  }

  const h = ghlHeaders(apiKey);

  try {
    // ── Parallel: stage map + custom field IDs ───────────────────────────────
    const [stageMap, { buyerFieldId, listFieldId }] = await Promise.all([
      fetchStageMap(locationId, h),
      fetchCustomFieldIds(locationId, h),
    ]);

    // ── Fetch all opportunities ──────────────────────────────────────────────
    const allOpps = await fetchAllOpportunities(locationId, h);

    // ── Shape opportunities → deals ──────────────────────────────────────────
    const deals = allOpps
      .map(opp => {
        const stageLabel = stageMap[opp.pipelineStageId] || opp.pipelineStageId || 'Unknown';
        const isWon = opp.status === 'won';
        const isLost = opp.status === 'lost' || opp.status === 'abandoned';

        // GHL sets closedDate when an opportunity is marked won/lost
        const closedate = opp.closedDate || (isWon || isLost ? opp.updatedAt : null) || null;

        return {
          id: opp.id,
          name: (opp.name || 'Unnamed Deal').trim(),
          closedate,
          createdate: opp.createdAt || null,
          stage: stageLabel,
          isClosedWon: isWon,
          isClosedLost: isLost,
          fee: parseFloat(opp.monetaryValue) || 0,
          buyerPrice: customFieldValue(opp, buyerFieldId),
          listPrice: customFieldValue(opp, listFieldId),
          contactIds: opp.contactId ? [opp.contactId] : [],
        };
      })
      .filter(d => !EXCLUDED_STAGES.has(d.stage));

    // ── Funnel helpers ───────────────────────────────────────────────────────
    function dealsByCreateYear(yr) {
      const [start, end] = YEAR_RANGES[yr];
      return allOpps.filter(o => {
        const cd = o.createdAt;
        if (!cd) return false;
        if (cd < start) return false;
        if (end && cd >= end) return false;
        return true;
      });
    }

    function closedWonByYear(yr) {
      const [start, end] = YEAR_RANGES[yr];
      return deals.filter(d => {
        if (!d.isClosedWon || !d.closedate) return false;
        if (d.closedate < start) return false;
        if (end && d.closedate >= end) return false;
        return true;
      });
    }

    function computeFunnel(wonDeals, allOppsSubset) {
      const netLeadIds = new Set(allOppsSubset.map(o => o.contactId).filter(Boolean));
      return {
        netLeads: netLeadIds.size,
        contracts: allOppsSubset.length,
        closedWon: wonDeals.length,
      };
    }

    // ── Contact counts (grossLeads) — run in parallel ────────────────────────
    const [grossAll, gross2024, gross2025, gross2026] = await Promise.all([
      getContactCount(locationId, h, null, null),
      getContactCount(locationId, h, YEAR_RANGES[2024][0], YEAR_RANGES[2024][1]),
      getContactCount(locationId, h, YEAR_RANGES[2025][0], YEAR_RANGES[2025][1]),
      getContactCount(locationId, h, YEAR_RANGES[2026][0], null),
    ]);

    const funnelAll  = computeFunnel(deals.filter(d => d.isClosedWon), allOpps);
    const funnel2024 = computeFunnel(closedWonByYear(2024), dealsByCreateYear(2024));
    const funnel2025 = computeFunnel(closedWonByYear(2025), dealsByCreateYear(2025));
    const funnel2026 = computeFunnel(closedWonByYear(2026), dealsByCreateYear(2026));

    return res.status(200).json({
      deals,
      total: deals.length,
      fetchedAt: new Date().toISOString(),
      funnel: {
        all:  { grossLeads: grossAll,  ...funnelAll  },
        2024: { grossLeads: gross2024, ...funnel2024 },
        2025: { grossLeads: gross2025, ...funnel2025 },
        2026: { grossLeads: gross2026, ...funnel2026 },
      },
    });

  } catch (err) {
    console.error('[GHL] handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
