const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
const emails = fs.readFileSync('C:/Users/Admin/AppData/Local/Temp/role_emails.txt', 'utf8').trim().split('\n');
const roleFor = (e) => e.match(/e2e-live2?-([A-Z_]+)-/i)[1].toUpperCase();
(async () => {
  for (const email of emails) {
    const role = roleFor(email);
    await p.user.update({ where: { email: email.toLowerCase() }, data: { roles: [role] } });
    console.log(email.toLowerCase(), '->', role);
  }
  await p.$disconnect();
})();
