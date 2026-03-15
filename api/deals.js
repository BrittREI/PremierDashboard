export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

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
      'amount',
      'assigned_amount',
      'dispo_amount',
    ].join(',');

    let allDeals = [];
    let after = null;
    do {
      let url = 'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=' + props + '&associations=contacts';
      if (after) url += '&after=' + after;
      const resp = await fetch(url, { headers: h });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        return res.status(resp.status).json({ error: e.message || 'HubSpot error ' + resp.status });
      }
      const data = await resp.json();
      allDeals = allDeals.concat(data.results || []);
      after = (data.paging && data.paging.next && data.paging.next.after) ? data.paging.next.after : null;
    } while (after);

    // Stages that count as closed-lost (not active, not closed-won)
    const CLOSED_LOST_STAGE_IDS = new Set(['196795054', '228334260', '1025346924']);

    // Debug: capture unique stage IDs seen in raw results
    const stageIdsSeen = [...new Set(allDeals.map(function(d) { return d.properties.dealstage; }))];

    // 3. Shape all deals (no stage filter — let frontend handle display filtering)
    const deals = allDeals.map(function(d) {
      return {
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
        contactIds: (d.associations && d.associations.contacts && d.associations.contacts.results
          ? d.associations.contacts.results : []).map(function(c) { return c.id; }),
      };
    });

    // 4. Helper: get gross leads for a date range
    async function getGrossLeads(afterDate, beforeDate) {
      const filters = [];
      if (afterDate) filters.push({ propertyName: 'createdate', operator: 'GTE', value: afterDate });
      if (beforeDate) filters.push({ propertyName: 'createdate', operator: 'LT', value: beforeDate });
      if (!filters.length) {
        filters.push({ propertyName: 'createdate', operator: 'GTE', value: '2000-01-01T00:00:00.000Z' });
      }
      try {
        const body = JSON.stringify({
          filterGroups: [{ filters: filters }],
          limit: 1,
          properties: ['createdate'],
          sorts: [],
        });
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: h,
          body: body,
        });
        const d = await r.json();
        if (d.status === 'error' || !r.ok) {
          return 0;
        }
        return d.total || 0;
      } catch (e) {
        return 0;
      }
    }

    // 5. Helper: compute funnel for a subset of deals
    function computeFunnel(dealsSubset, allDealsSubset) {
      const netLeadIds = new Set();
      for (const deal of allDealsSubset) {
        const assoc = (deal.associations && deal.associations.contacts && deal.associations.contacts.results)
          ? deal.associations.contacts.results : [];
        for (const c of assoc) netLeadIds.add(c.id);
      }
      return {
        netLeads: netLeadIds.size,
        contracts: allDealsSubset.length,
        closedWon: dealsSubset.filter(function(d) { return d.isClosedWon; }).length,
      };
    }

    // 6. Build per-year funnels
    const yearRanges = {
      2024: ['2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
      2025: ['2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      2026: ['2026-01-01T00:00:00.000Z', null],
    };

    const grossAll   = await getGrossLeads(null, null);
    const gross2024  = await getGrossLeads(yearRanges[2024][0], yearRanges[2024][1]);
    const gross2025  = await getGrossLeads(yearRanges[2025][0], yearRanges[2025][1]);
    const gross2026  = await getGrossLeads(yearRanges[2026][0], yearRanges[2026][1]);

    function dealsByCreateYear(yr) {
      const start = yearRanges[yr][0];
      const end = yearRanges[yr][1];
      return allDeals.filter(function(d) {
        const cd = d.properties.createdate;
        if (!cd) return false;
        if (cd < start) return false;
        if (end && cd >= end) return false;
        return true;
      });
    }

    function closedWonByYear(yr) {
      const start = yearRanges[yr][0];
      const end = yearRanges[yr][1];
      return deals.filter(function(d) {
        if (!d.isClosedWon || !d.closedate) return false;
        if (d.closedate < start) return false;
        if (end && d.closedate >= end) return false;
        return true;
      });
    }

    const funnelAll  = computeFunnel(deals, allDeals);
    const funnel2024 = computeFunnel(closedWonByYear(2024), dealsByCreateYear(2024));
    const funnel2025 = computeFunnel(closedWonByYear(2025), dealsByCreateYear(2025));
    const funnel2026 = computeFunnel(closedWonByYear(2026), dealsByCreateYear(2026));

    return res.status(200).json({
      deals: deals,
      total: deals.length,
      fetchedAt: new Date().toISOString(),
      debug: { stageIdsSeen: stageIdsSeen, allDealsCount: allDeals.length },
      funnel: {
        all:  { grossLeads: grossAll,  ...funnelAll  },
        2024: { grossLeads: gross2024, ...funnel2024 },
        2025: { grossLeads: gross2025, ...funnel2025 },
        2026: { grossLeads: gross2026, ...funnel2026 },
      },
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
