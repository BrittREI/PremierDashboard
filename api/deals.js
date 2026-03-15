export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HUBSPOT_TOKEN environment variable not configured' });
  }

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    // 1. Fetch pipeline stage name map
    const pipeRes = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', { headers: h });
    const pipeData = await pipeRes.json();
    const stageMap = {};
    for (const pipe of (pipeData.results || [])) {
      for (const s of (pipe.stages || [])) {
        stageMap[s.id] = s.label;
      }
    }

    // 2. Paginate through all deals (with associations to contacts)
    const props = [
      'dealname', 'closedate', 'createdate', 'dealstage',
      'hs_is_closed_won', 'hs_is_closed',
      'amount',           // wholesale fee / gross profit
      'assigned_amount',  // buyer agreed purchase price
      'dispo_amount',     // marketing / list price
    ].join(',');

    let allDeals = [];
    let after = null;
    do {
      const url = 'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=' + props + '&associations=contacts' + (after ? '&after=' + after : '');
      const r = await fetch(url, { headers: h });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: e.message || `HubSpot error ${r.status}` });
      }
      const d = await r.json();
      allDeals = allDeals.concat(d.results || []);
      after = d.paging?.next?.after ?? null;
    } while (after);

    // Stage IDs that represent terminal/dead states (not active, not closed-won)
    const CLOSED_LOST_STAGE_IDS = new Set(['196795054', '228334260', '1025346924']); // Abandoned, Invalid Lead, Not Responding

    // Only include deals that belong to your real pipeline stages — filters out archived/legacy deals
    const KNOWN_STAGE_IDS = new Set(['164063498', '164077216', '164077217', '164077218', '164077219', '196795054', '196916744', '228334260', '1025346924']);

    // 3. Shape deals — filter to known stages only
    const deals = allDeals
      .filter(d => KNOWN_STAGE_IDS.has(d.properties.dealstage))
      .map(d => ({
      id: d.id,
      name: (d.properties.dealname || 'Unnamed Deal').trim(),
      closedate: d.properties.closedate || null,
      createdate: d.properties.createdate || null,
      stage: stageMap[d.properties.dealstage] || d.properties.dealstage || 'Unknown',
      isClosedWon: d.properties.hs_is_closed_won === 'true',
      isClosedLost: CLOSED_LOST_STAGE_IDS.has(d.properties.dealstage),
      fee: parseFloat(d.properties.amount) || 0,
      buyerPrice: parseFloat(d.properties.assigned_amount) || 0,
      listPrice: parseFloat(d.properties.dispo_amount) || 0,
      contactIds: (allDeals.find(x => x.id === d.id)?.associations?.contacts?.results || []).map(c => c.id),
    }));

    // 4. Helper: get gross leads for a date range using contacts search
    async function getGrossLeads(afterDate, beforeDate) {
      // Always include at least one filter — HubSpot search requires non-empty filterGroups
      // Use createdate EXISTS as a catch-all when no date range is specified
      const filters = [];
      if (afterDate) filters.push({ propertyName: 'createdate', operator: 'GTE', value: afterDate });
      if (beforeDate) filters.push({ propertyName: 'createdate', operator: 'LT',  value: beforeDate });
      if (!filters.length) {
        // Match all contacts by filtering createdate >= a very early date
        filters.push({ propertyName: 'createdate', operator: 'GTE', value: '2000-01-01T00:00:00.000Z' });
      }
      try {
        const body = JSON.stringify({
          filterGroups: [{ filters }],
          limit: 1,
          properties: ['createdate'],
          sorts: [],
        });
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: h,
          body,
        });
        const d = await r.json();
        // Return full response in a debug field so we can inspect it
        if (d.status === 'error' || !r.ok) {
          return { error: true, status: r.status, message: d.message, category: d.category, body };
        }
        return d.total ?? 0;
      } catch (e) {
        return { error: true, message: e.message };
      }
    }

    // 5. Helper: compute funnel for a subset of deals + a year range
    function computeFunnel(dealsSubset, allDealsSubset) {
      const netLeadIds = new Set();
      for (const deal of allDealsSubset) {
        const assoc = deal.associations?.contacts?.results || [];
        for (const c of assoc) netLeadIds.add(c.id);
      }
      return {
        netLeads: netLeadIds.size,
        contracts: allDealsSubset.length,
        closedWon: dealsSubset.filter(d => d.isClosedWon).length,
      };
    }

    // 6. Build per-year funnels in parallel
    const years = [2024, 2025, 2026];
    const yearRanges = {
      2024: ['2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
      2025: ['2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      2026: ['2026-01-01T00:00:00.000Z', null],
    };

    // Fetch all gross lead counts in parallel
    const [grossAll, gross2024, gross2025, gross2026] = await Promise.all([
      getGrossLeads(null, null),
      getGrossLeads(yearRanges[2024][0], yearRanges[2024][1]),
      getGrossLeads(yearRanges[2025][0], yearRanges[2025][1]),
      getGrossLeads(yearRanges[2026][0], yearRanges[2026][1]),
    ]);

    // Filter deals by createdate year for contracts/netLeads
    function dealsByCreateYear(yr) {
      const [start, end] = yearRanges[yr];
      return allDeals.filter(d => {
        const cd = d.properties.createdate;
        if (!cd) return false;
        if (cd < start) return false;
        if (end && cd >= end) return false;
        return true;
      });
    }

    // Filter shaped deals by closedate year for closedWon
    function closedWonByYear(yr) {
      const [start, end] = yearRanges[yr];
      return deals.filter(d => {
        if (!d.isClosedWon || !d.closedate) return false;
        if (d.closedate < start) return false;
        if (end && d.closedate >= end) return false;
        return true;
      });
    }

    const funnelAll = computeFunnel(deals, allDeals);
    const funnel2024 = computeFunnel(closedWonByYear(2024), dealsByCreateYear(2024));
    const funnel2025 = computeFunnel(closedWonByYear(2025), dealsByCreateYear(2025));
    const funnel2026 = computeFunnel(closedWonByYear(2026), dealsByCreateYear(2026));

    return res.status(200).json({
      deals,
      total: deals.length,
      fetchedAt: new Date().toISOString(),
      contactDebug: { grossAll, gross2024, gross2025, gross2026 },
      funnel: {
        all:  { grossLeads: typeof grossAll  === 'number' ? grossAll  : 0, ...funnelAll },
        2024: { grossLeads: typeof gross2024 === 'number' ? gross2024 : 0, ...funnel2024 },
        2025: { grossLeads: typeof gross2025 === 'number' ? gross2025 : 0, ...funnel2025 },
        2026: { grossLeads: typeof gross2026 === 'number' ? gross2026 : 0, ...funnel2026 },
      },
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
