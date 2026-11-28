const assert = require("assert");
const m = require("../drivers/services/onu-auto-mapping.service");
const customers = [
    { id: 1, pppoe_username: "Rahim01", name: "Rahim Uddin", customer_id: "C-1001" },
    { id: 2, pppoe_username: "karim02", name: "Karim", customer_id: "C-1002" },
    { id: 3, pppoe_username: "dup3", name: "Same Name", customer_id: "C-1003" },
    { id: 4, pppoe_username: "dup4", name: "Same Name", customer_id: "C-1004" }
];
const index = m.indexCustomers(customers);
const sessions = m.indexSessions([{ mac: "A2:3D:09:21:26:E0", username: "rahim01", address: "10.0.0.5" }]);
const run = (onus, learned) => m.decide({ onus, learned: new Map(learned), mappings: new Map(), linkedElsewhere: new Map(), index, sessionsByMac: sessions });

// 1) PPPoE username differs only in case -> still linked
let d = run([{ id: 10, mac: "A2:3D:09:21:26:E0", name: "" }], []);
assert.strictEqual(d[0].status, "will_link"); assert.strictEqual(d[0].customerId, 1);
// 2) offline ONU: description equals customer id -> linked (weak evidence)
d = run([{ id: 11, mac: "54:93:59:21:3C:92", name: "C-1002" }], []);
assert.strictEqual(d[0].status, "will_link"); assert.strictEqual(d[0].customerId, 2);
// 3) description matching two customers -> never guessed
d = run([{ id: 12, mac: "54:93:59:21:3C:93", name: "Same Name" }], []);
assert.strictEqual(d[0].status, "unmatched");
// 4) generic / short description is not evidence
d = run([{ id: 13, mac: "54:93:59:21:3C:94", name: "ONU1" }], []);
assert.strictEqual(d[0].status, "unmatched");
console.log("4 tests passed");
