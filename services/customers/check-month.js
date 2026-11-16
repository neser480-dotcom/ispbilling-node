// Dry run of the month-start job. Changes NOTHING in the database.
const svc = require("./services/customers/customer-month-start.service");

svc.run({ dryRun: true })
    .then(r => { console.log(r); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
