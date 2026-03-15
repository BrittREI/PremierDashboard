// check-hubspot-fields.js
// Run with: node check-hubspot-fields.js YOUR_TOKEN_HERE

const token = process.argv[2];

if (!token) {
  console.error('Usage: node check-hubspot-fields.js YOUR_HUBSPOT_TOKEN');
  process.exit(1);
}

async function main() {
  console.log('\n🔍 Fetching your HubSpot deal properties...\n');

  // 1. Get all deal property definitions
  const propsRes = await fetch('https://api.hubapi.com/crm/v3/properties/deals', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const propsData = await propsRes.json();
  const allProps = propsData.results.map(p => p.name);

  // 2. Fetch a sample of deals (up to 100) with ALL properties
  const dealsRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=${allProps.join(',')}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const dealsData = await dealsRes.json();
  const deals = dealsData.results || [];

  console.log(`✅ Found ${deals.length} deals to scan\n`);

  // 3. Find which properties actually have values
  const usedProps = {};
  for (const deal of deals) {
    for (const [key, val] of Object.entries(deal.properties || {})) {
      if (val !== null && val !== '' && val !== undefined) {
        if (!usedProps[key]) usedProps[key] = { count: 0, sample: val };
        usedProps[key].count++;
      }
    }
  }

  // 4. Print results sorted by usage count
  const sorted = Object.entries(usedProps)
    .sort((a, b) => b[1].count - a[1].count);

  // Skip internal HubSpot system fields to keep output clean
  const systemFields = new Set([
    'hs_lastmodifieddate','hs_createdate','hs_object_id','hs_pipeline',
    'hs_pipeline_stage','createdate','closedate','hs_is_closed',
    'hs_is_closed_won','hs_closed_won_date','hs_date_entered_closedwon',
    'hs_time_in_closedwon','hs_date_exited_closedwon'
  ]);

  console.log('📋 ACTIVE DEAL PROPERTIES (sorted by usage)\n');
  console.log('Property Name'.padEnd(45) + 'Used In'.padEnd(12) + 'Sample Value');
  console.log('-'.repeat(90));

  for (const [prop, { count, sample }] of sorted) {
    if (systemFields.has(prop)) continue;
    const sampleStr = String(sample).substring(0, 30);
    console.log(prop.padEnd(45) + `${count} deals`.padEnd(12) + sampleStr);
  }

  // Also print key system fields separately
  console.log('\n📅 KEY SYSTEM FIELDS\n');
  console.log('Property Name'.padEnd(45) + 'Used In'.padEnd(12) + 'Sample Value');
  console.log('-'.repeat(90));
  for (const [prop, { count, sample }] of sorted) {
    if (!systemFields.has(prop)) continue;
    const sampleStr = String(sample).substring(0, 30);
    console.log(prop.padEnd(45) + `${count} deals`.padEnd(12) + sampleStr);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
