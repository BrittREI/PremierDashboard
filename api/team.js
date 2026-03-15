export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HUBSPOT_TOKEN not configured' });
  }

  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Active owners only
  const ACTIVE_OWNERS = {
    '79989208':   'Omar Wafik',
    '80801798':   'Omnia Salem',
    '86146575':   'Jana Alqadi',
    '87843098':   'Yasmin Hany',
    '349687975':  'Andrea Bernatowicz',
    '507449521':  'Peter Russell',
    '944794198':  'Brittany McCracken',
    '2137513240': 'Devon Sprague',
  };

  const ownerIds = Object.keys(ACTIVE_OWNERS);

  // Lead status labels
  const LEAD_STATUS_LABELS = {
    'NEW':                    'New',
    'ATTEMPTED_TO_CONTACT':   'Voicemail',
    'OPEN':                   'Working',
    'IN_PROGRESS':            'Connected / Bad Lead',
    'Nurture':                'Nurture',
    'Follow up':              'Follow Up',
    'Call Booked':            'Call Booked',
    'Not Interested':         'Not Interested',
    'Disqualified':           'Disqualified',
    'Dead':                   'Dead',
    'Closed/funded':          'Closed / Funded',
    'UNQUALIFIED':            'Not Responding Nurture',
    'OPEN_DEAL':              'Lender',
    'Wrong person':           'Wrong Person',
    'Affiliate no response':  'Affiliate No Response',
    'Affiliate follow-up':    'Affiliate Follow-Up',
  };

  // Active statuses (lead is still workable)
  const ACTIVE_STATUSES = new Set(['NEW', 'ATTEMPTED_TO_CONTACT', 'OPEN', 'Nurture', 'Follow up', 'Call Booked', 'IN_PROGRESS']);

  try {
    // ── 1. Fetch contacts per owner via search ─────────────────────────────
    async function getContactsForOwner(ownerId) {
      const allContacts = [];
      let after = null;
      do {
        const body = {
          filterGroups: [{ filters: [{ propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId }] }],
          properties: ['hs_lead_status', 'lifecyclestage', 'num_associated_deals', 'createdate'],
          limit: 200,
          sorts: [],
        };
        if (after) body.after = after;
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: h,
          body: JSON.stringify(body),
        });
        const d = await r.json();
        allContacts.push(...(d.results || []));
        after = (d.paging && d.paging.next && d.paging.next.after) ? d.paging.next.after : null;
      } while (after);
      return allContacts;
    }

    // ── 2. Fetch deals per owner ───────────────────────────────────────────
    async function getDealsForOwner(ownerId) {
      const allDeals = [];
      let after = null;
      const EXCLUDED_STAGE_LABEL = 'Appointment scheduled';
      do {
        const body = {
          filterGroups: [{ filters: [{ propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId }] }],
          properties: ['dealstage', 'amount', 'hs_is_closed_won', 'closedate', 'createdate'],
          limit: 200,
          sorts: [],
        };
        if (after) body.after = after;
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
          method: 'POST',
          headers: h,
          body: JSON.stringify(body),
        });
        const d = await r.json();
        allDeals.push(...(d.results || []));
        after = (d.paging && d.paging.next && d.paging.next.after) ? d.paging.next.after : null;
      } while (after);
      return allDeals;
    }

    // ── 3. Fetch pipeline stage map ────────────────────────────────────────
    const pipeRes = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', { headers: h });
    const pipeData = await pipeRes.json();
    const stageMap = {};
    for (const pipe of (pipeData.results || [])) {
      for (const s of (pipe.stages || [])) {
        stageMap[s.id] = s.label;
      }
    }

    const CLOSED_LOST_LABELS = new Set(['Closed lost', 'Abandoned', 'Invalid Lead', 'Not Responding']);

    // ── 4. Compute stats per owner in parallel ─────────────────────────────
    const ownerStats = await Promise.all(ownerIds.map(async function(ownerId) {
      const [contacts, deals] = await Promise.all([
        getContactsForOwner(ownerId),
        getDealsForOwner(ownerId),
      ]);

      // Contact stats
      const statusBreakdown = {};
      let contactsWithDeals = 0;
      let activeLeads = 0;

      contacts.forEach(function(c) {
        const status = c.properties.hs_lead_status || 'Unknown';
        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
        if (parseInt(c.properties.num_associated_deals || '0') > 0) contactsWithDeals++;
        if (ACTIVE_STATUSES.has(status)) activeLeads++;
      });

      const conversionRate = contacts.length > 0 ? (contactsWithDeals / contacts.length * 100).toFixed(1) : '0.0';

      // Deal stats — filter phantom stage labels
      const validDeals = deals.filter(function(d) {
        const label = stageMap[d.properties.dealstage] || d.properties.dealstage || '';
        return label !== 'Appointment scheduled';
      });

      let dealsCreated = validDeals.length;
      let closedWon = 0;
      let revenue = 0;
      let activePipeline = 0;
      let activePipelineCount = 0;

      validDeals.forEach(function(d) {
        const label = stageMap[d.properties.dealstage] || '';
        const fee = parseFloat(d.properties.amount) || 0;
        if (d.properties.hs_is_closed_won === 'true') {
          closedWon++;
          revenue += fee;
        } else if (!CLOSED_LOST_LABELS.has(label)) {
          activePipeline += fee;
          activePipelineCount++;
        }
      });

      const closeRate = dealsCreated > 0 ? (closedWon / dealsCreated * 100).toFixed(1) : '0.0';

      return {
        ownerId,
        name: ACTIVE_OWNERS[ownerId],
        contacts: {
          total: contacts.length,
          activeLeads,
          withDeals: contactsWithDeals,
          conversionRate: parseFloat(conversionRate),
          statusBreakdown,
        },
        deals: {
          total: dealsCreated,
          closedWon,
          revenue,
          activePipeline,
          activePipelineCount,
          closeRate: parseFloat(closeRate),
        },
      };
    }));

    return res.status(200).json({
      owners: ownerStats,
      fetchedAt: new Date().toISOString(),
      leadStatusLabels: LEAD_STATUS_LABELS,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
