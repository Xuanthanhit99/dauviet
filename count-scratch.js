const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const counts = {};
  for (const m of ['country','region','city','destination','externalProvider','providerCapability','providerIntegration','providerIntegrationCapability','providerLicense','providerDataPolicy','providerAttributionRule','providerPolicyEvidence']) {
    counts[m] = await p[m].count();
  }
  console.log(JSON.stringify(counts, null, 2));
  await p.$disconnect();
})();
