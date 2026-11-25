"use strict";
const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname, "../drivers");
const { HiosoDriver, rxDbm } = require(root + "/hardware/hioso");
const { HsgqDriver, decodeIndex, identity, centiDbm } = require(root + "/hardware/hsgq");
const { ZteEponDriver, decodeOnuIndex } = require(root + "/hardware/zte-epon");

// Fake read-only SNMP agent: oid -> value. walk(base) = every oid under base, in numeric order.
function agent(map) {
    const cmp = (a, b) => { const x=a.split(".").map(Number), y=b.split(".").map(Number);
        for (let i=0;i<Math.max(x.length,y.length);i++){ if((x[i]??-1)!==(y[i]??-1)) return (x[i]??-1)-(y[i]??-1);} return 0; };
    return {
        async get(oid) { return map.has(oid) ? map.get(oid) : null; },
        async walk(base) { return [...map.entries()].filter(([o]) => o.startsWith(base + ".")).sort((a,b)=>cmp(a[0],b[0])); },
        close() {}
    };
}
const mac = hex => Buffer.from(hex, "hex");
let passed = 0; const ok = (name, fn) => Promise.resolve().then(fn).then(() => { passed++; console.log("ok -", name); });

(async () => {
// ---------- HIOSO ----------
await ok("hioso: online/offline/unknown, rx range, zero-mac slot skipped, PON from ifDescr", async () => {
    const M = new Map();
    M.set("1.3.6.1.2.1.1.2.0", "1.3.6.1.4.1.25355.1");
    M.set("1.3.6.1.2.1.1.1.0", Buffer.from("HIOSO EPON OLT"));
    M.set("1.3.6.1.2.1.2.2.1.2.1", Buffer.from("pon-nni1"));
    M.set("1.3.6.1.2.1.2.2.1.2.2", Buffer.from("pon-nni 2"));
    M.set("1.3.6.1.2.1.2.2.1.2.9", Buffer.from("ge1"));
    const MAC="1.3.6.1.4.1.25355.3.2.6.3.2.1.11.1", NAME="1.3.6.1.4.1.25355.3.2.6.3.2.1.37.1",
          LINK="1.3.6.1.4.1.25355.3.2.6.3.2.1.39.1", RX="1.3.6.1.4.1.25355.3.2.6.14.2.1.8.1";
    M.set(`${MAC}.1.1`, mac("aabbccddee01")); M.set(`${NAME}.1.1`, Buffer.from("cust-one")); M.set(`${LINK}.1.1`, 1); M.set(`${RX}.1.1`, Buffer.from("-18.52"));
    M.set(`${MAC}.1.2`, mac("aabbccddee02")); M.set(`${LINK}.1.2`, 2); M.set(`${RX}.1.2`, Buffer.from("NA"));
    M.set(`${MAC}.2.1`, mac("000000000000"));                       // ghost slot
    M.set(`${MAC}.2.3`, mac("aabbccddee03"));                       // no link, rx valid -> online
    M.set(`${RX}.2.3`, Buffer.from("-21.10"));
    M.set(`${MAC}.2.4`, mac("aabbccddee04"));                       // nothing known -> unknown
    const d = new HiosoDriver({ snmpClient: agent(M) });
    await d.connect(); await d.detectModel();
    const rows = await d.getONUList();
    assert.strictEqual(rows.length, 4);
    const by = Object.fromEntries(rows.map(r => [`${r.pon}.${r.ont_id}`, r]));
    assert.strictEqual(by["1.1"].mac, "AA:BB:CC:DD:EE:01"); assert.strictEqual(by["1.1"].status, "online");
    assert.strictEqual(by["1.1"].rx_power, -18.52); assert.strictEqual(by["1.1"].name, "cust-one");
    assert.strictEqual(by["1.2"].status, "offline"); assert.strictEqual(by["1.2"].rx_power, null);
    assert.strictEqual(by["2.3"].status, "online"); assert.strictEqual(by["2.3"].rx_power, -21.1);
    assert.strictEqual(by["2.4"].status, "unknown");
    assert.ok(rows.every(r => r.f_s === "0/1"));
    assert.strictEqual(rxDbm("0"), null); assert.strictEqual(rxDbm("-99"), null); assert.strictEqual(rxDbm("n/a"), null);
});

await ok("hioso: wrong vendor with zero ONUs gives a clear error", async () => {
    const M = new Map([["1.3.6.1.2.1.1.2.0", "1.3.6.1.4.1.9999.1"]]);
    const d = new HiosoDriver({ snmpClient: agent(M) }); await d.connect();
    await assert.rejects(d.getONUList(), /does not look like a HIOSO/);
});

await ok("hioso: no SNMP answer -> clear error", async () => {
    const d = new HiosoDriver({ snmpClient: agent(new Map()) });
    await assert.rejects(d.connect(), /No SNMP answer/);
});

// ---------- HSGQ ----------
await ok("hsgq: index decode", async () => {
    assert.deepStrictEqual(decodeIndex(0x01000305), { pon: 3, onuId: 5 });
    assert.strictEqual(decodeIndex(0x02000305), null); assert.strictEqual(decodeIndex(0x01000005), null);
});
await ok("hsgq: identity handles MAC (bytes + text), EPON/GPON serial", async () => {
    assert.strictEqual(identity(mac("aabbccddee01"), true).mac, "AA:BB:CC:DD:EE:01");
    assert.strictEqual(identity(Buffer.from("AA:BB:CC:DD:EE:02"), true).mac, "AA:BB:CC:DD:EE:02");
    const g = identity(Buffer.from([0x48,0x57,0x54,0x43,0x1a,0x2b,0x3c,0x4d]));   // "HWTC" 1a2b3c4d
    assert.strictEqual(g.serial, "HWTC1A2B3C4D"); assert.strictEqual(g.mac, null);
    assert.strictEqual(identity(null).serial, null);
});
await ok("hsgq: centiDbm window", async () => {
    assert.strictEqual(centiDbm(-1850), -18.5); assert.strictEqual(centiDbm(0), null);
    assert.strictEqual(centiDbm(500), null); assert.strictEqual(centiDbm(-7000), null);
});
function hsgqAgent(schema) {   // legacy layout, 2 PONs, status via status column
    const M = new Map(); const T = "1.3.6.1.4.1.50224.3.3.2.1", O = "1.3.6.1.4.1.50224.3.3.3.1";
    M.set("1.3.6.1.2.1.1.2.0", "1.3.6.1.4.1.50224.1"); M.set("1.3.6.1.2.1.1.1.0", Buffer.from("HSGQ EPON"));
    const idx = (pon, onu) => 0x01000000 | (pon << 8) | onu;
    const add = (pon, onu, macHex, name, status, rxc, tx, dist) => {
        const i = idx(pon, onu);
        M.set(`${T}.7.${i}`, mac(macHex)); M.set(`${T}.2.${i}`, Buffer.from(name)); M.set(`${T}.9.${i}`, status);
        M.set(`${T}.15.${i}`, dist); M.set(`${O}.4.${i}.0.0`, rxc); M.set(`${O}.5.${i}.0.0`, tx);
    };
    add(1, 1, "aabbccddee11", "u1", 1, -1900, 230, 1200);
    add(1, 2, "aabbccddee12", "u2", 2, 0, 0, 0);
    add(2, 5, "aabbccddee21", "u3", 1, -2210, 225, 800);
    // OLT's own counters: PON1 has 1 online, PON2 has 1 online -> status column matches
    M.set(`1.3.6.1.4.1.50224.3.2.3.1.3.${idx(1,0)}`, 2); M.set(`1.3.6.1.4.1.50224.3.2.3.1.4.${idx(1,0)}`, 1);
    M.set(`1.3.6.1.4.1.50224.3.2.3.1.3.${idx(2,0)}`, 1); M.set(`1.3.6.1.4.1.50224.3.2.3.1.4.${idx(2,0)}`, 1);
    return agent(M);
}
await ok("hsgq: legacy schema rows, status verified against PON counters, rx only when online", async () => {
    const d = new HsgqDriver({ snmpClient: hsgqAgent() }); await d.connect();
    const rows = await d.getONUList(); assert.strictEqual(rows.length, 3);
    const by = Object.fromEntries(rows.map(r => [`${r.pon}.${r.ont_id}`, r]));
    assert.strictEqual(by["1.1"].mac, "AA:BB:CC:DD:EE:11"); assert.strictEqual(by["1.1"].status, "online");
    assert.strictEqual(by["1.1"].rx_power, -19); assert.strictEqual(by["1.1"].tx_power, 2.3); assert.strictEqual(by["1.1"].distance, 1200);
    assert.strictEqual(by["1.2"].status, "offline"); assert.strictEqual(by["1.2"].rx_power, null); assert.strictEqual(by["1.2"].distance, null);
    assert.strictEqual(by["2.5"].name, "u3");
    assert.deepStrictEqual(d.statusCheck, { source: "status_column", verified: true });
});
await ok("hsgq: when status column disagrees with OLT counters, RX-based status is chosen", async () => {
    const M = new Map(); const T = "1.3.6.1.4.1.50224.3.3.2.1", O = "1.3.6.1.4.1.50224.3.3.3.1"; const i1 = 0x01000101, i2 = 0x01000102;
    M.set("1.3.6.1.2.1.1.2.0", "x");
    for (const [i, m, st, rx] of [[i1,"aabbccddee31",1,-2000],[i2,"aabbccddee32",1,0]]) { M.set(`${T}.7.${i}`, mac(m)); M.set(`${T}.9.${i}`, st); if (rx) M.set(`${O}.4.${i}.0.0`, rx); }
    M.set(`1.3.6.1.4.1.50224.3.2.3.1.3.${0x01000100}`, 2); M.set(`1.3.6.1.4.1.50224.3.2.3.1.4.${0x01000100}`, 1);
    const d = new HsgqDriver({ snmpClient: agent(M) }); await d.connect(); const rows = await d.getONUList();
    assert.deepStrictEqual(d.statusCheck, { source: "rx", verified: true });
    assert.deepStrictEqual(rows.map(r => r.status), ["online", "offline"]);
});
await ok("hsgq: no known ONU table -> empty list", async () => {
    const d = new HsgqDriver({ snmpClient: agent(new Map([["1.3.6.1.2.1.1.2.0", "x"]])) });
    assert.deepStrictEqual(await d.getONUList(), []);
});

// ---------- ZTE EPON ----------
await ok("zte-epon: index decode round trip", async () => {
    const enc = (slot, port, onu) => ((3 << 28) | (slot << 19) | ((port - 1) << 16) | (onu << 8)) >>> 0;
    assert.deepStrictEqual(decodeOnuIndex(enc(4, 8, 7)), { slot: 4, port: 8, onuId: 7 });
    assert.strictEqual(decodeOnuIndex(enc(4, 8, 7) | 1), null); assert.strictEqual(decodeOnuIndex(0x1000100), null);
});
await ok("zte-epon: rows from state/mac/model, only ports of EPON cards", async () => {
    const enc = (slot, port, onu) => ((3 << 28) | (slot << 19) | ((port - 1) << 16) | (onu << 8)) >>> 0;
    const M = new Map(); M.set("1.3.6.1.2.1.1.2.0", "1.3.6.1.4.1.3902.1015"); M.set("1.3.6.1.2.1.1.1.0", Buffer.from("ZXA10 C320"));
    const BN = "1.3.6.1.4.1.3902.1015.2.1.1.3.1.4";
    M.set(`${BN}.1.1.4`, Buffer.from("ETGO")); M.set(`${BN}.1.1.2`, Buffer.from("SCXN")); M.set(`${BN}.1.1.5`, Buffer.from("GTGH"));
    for (let p = 1; p <= 4; p++) M.set(`1.3.6.1.2.1.31.1.1.1.1.${100 + p}`, Buffer.from(`epon-olt_1/4/${p}`));
    M.set("1.3.6.1.2.1.31.1.1.1.1.200", Buffer.from("epon-olt_1/5/1"));       // slot 5 is a GPON card -> ignored
    M.set("1.3.6.1.2.1.31.1.1.1.1.300", Buffer.from("gei_1/3/1"));
    const ST="1.3.6.1.4.1.3902.1015.1010.1.2.1.1.1", MC="1.3.6.1.4.1.3902.1015.1010.1.1.1.1.1.4", MD="1.3.6.1.4.1.3902.1015.1010.1.1.1.1.1.3";
    const a = enc(4, 2, 1), b = enc(4, 2, 2), c = enc(4, 3, 9), g = enc(5, 1, 1);
    M.set(`${ST}.${a}`, 1); M.set(`${MC}.${a}`, mac("1c8779120c39")); M.set(`${MD}.${a}`, Buffer.from("F601"));
    M.set(`${ST}.${b}`, 2); M.set(`${MC}.${b}`, mac("1c8779120c40"));
    M.set(`${ST}.${c}`, 7); M.set(`${MC}.${c}`, mac("1c8779120c41"));
    M.set(`${ST}.${g}`, 1); M.set(`${MC}.${g}`, mac("1c8779120c99"));
    const d = new ZteEponDriver({ snmpClient: agent(M) }); await d.connect(); await d.detectModel();
    const rows = await d.getONUList(); assert.strictEqual(rows.length, 3);
    assert.deepStrictEqual(rows.map(r => [r.f_s, r.pon, r.ont_id, r.status, r.mac]),
        [["1/4", 2, 1, "online", "1C:87:79:12:0C:39"], ["1/4", 2, 2, "offline", "1C:87:79:12:0C:40"], ["1/4", 3, 9, "unknown", "1C:87:79:12:0C:41"]]);
    assert.strictEqual(rows[0].onu_model, "F601"); assert.strictEqual(rows[0].olt_model, "ZXA10 C320");
});
await ok("zte-epon: no EPON ports -> clear error; >8 ports on a slot -> refuse", async () => {
    const d1 = new ZteEponDriver({ snmpClient: agent(new Map([["1.3.6.1.2.1.1.2.0", "x"]])) });
    await assert.rejects(d1.getONUList(), /No ZTE EPON ports/);
    const M = new Map([["1.3.6.1.2.1.1.2.0", "x"]]); for (let p = 1; p <= 9; p++) M.set(`1.3.6.1.2.1.31.1.1.1.1.${p}`, Buffer.from(`epon-olt_1/2/${p}`));
    await assert.rejects(new ZteEponDriver({ snmpClient: agent(M) }).getONUList(), /only supports 8/);
});

// ---------- SNMP transport without the package installed ----------
await ok("transport: missing net-snmp / community give plain error messages", async () => {
    const d = new HiosoDriver({ ip: "10.0.0.1" });
    await assert.rejects(d.connect(), /snmp_community is missing|snmp_community/i);
    const d2 = new HiosoDriver({ ip: "10.0.0.1", community: "public" });
    await assert.rejects(d2.connect(), /net-snmp/);
});

console.log(`\n${passed} tests passed`);
})().catch(e => { console.error("FAIL:", e.message); console.error(e.stack.split("\n").slice(0,4).join("\n")); process.exit(1); });
