"use strict";
const assert = require("assert");
const net = require("net");
const path = require("path");
const root = path.resolve(__dirname, "../drivers");
const {
    VsolDriver, parseOnuStatus, parseOpmDiag, parseBasicInfo, mergeOnuRows
} = require(root + "/hardware/vsol");

const STATUS = `ONU-ID      Status    MAC Address         Distance(m) RTT(TQ)
EPON0/1:1   offline   54:93:59:21:3c:92    0            0
EPON0/1:2   offline   a0:7d:09:09:64:c6    0            0
EPON0/1:3   offline   4c:ae:1c:01:5c:98    0            0
EPON0/1:4   online    a2:3d:09:21:26:e0    79           144
EPON0/1:12  online    4c:d7:c8:ce:c4:49    120          150
EPON0/3:18  offline   c0:7e:40:d0:0a:da    0            0`;
const OPM = `ONU-ID      Temperature(C) Supply Voltage(V) TX Bias Current(mA) TX Power(dBm) RX Power(dBm)
EPON0/1:4   35.00          3.23              7.00                 2.31          -21.19
EPON0/1:12  38.00          3.24              13.50                2.24          -20.09
EPON0/1:3   30.00          3.20              5.00                 2.00          -19.00`;
const BASIC = `ONU-ID      VendorID  Model ID  hwVer         SwVer
EPON0/1:4   HWTC      ONU       A23D092126E0  AF6.A V3R016C10S150
EPON0/1:12  VSOL      D701      4CD7C8CEC449  V2.8 V6.1.0P1T8
EPON0/1:46  ZTE       1GE-      C07E40B8E27B  V1.0 SFUV1.0.1B03`;

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };

(async () => {
await ok("status parser: 6 ONUs, MAC upper-case, online/offline", async () => {
    const rows = parseOnuStatus(STATUS);
    assert.strictEqual(rows.length, 6);
    assert.deepStrictEqual(
        [rows[3].f_s, rows[3].ont_id, rows[3].status, rows[3].onu_mac, rows[3].distance, rows[3].rtt],
        ["0/1", 4, "online", "A2:3D:09:21:26:E0", 79, 144]);
    assert.strictEqual(rows[5].f_s, "0/3");
});

await ok("opm-diag parser: column order temp, volt, bias, tx, rx", async () => {
    const r = parseOpmDiag(OPM)[0];
    assert.deepStrictEqual(
        [r.temperature, r.voltage, r.bias_current, r.tx_power, r.rx_power],
        [35, 3.23, 7, 2.31, -21.19]);
});

await ok("basic-info parser: vendor, model, hw, sw (sw keeps its space)", async () => {
    const r = parseBasicInfo(BASIC)[1];
    assert.deepStrictEqual(
        [r.vendor_id, r.model_id, r.hw_version, r.sw_version],
        ["VSOL", "D701", "4CD7C8CEC449", "V2.8 V6.1.0P1T8"]);
});

await ok("merge: optical only for online ONUs, offline stays null (no invented values)", async () => {
    const rows = mergeOnuRows(parseOnuStatus(STATUS), parseOpmDiag(OPM), parseBasicInfo(BASIC));
    const by = id => rows.find(r => `${r.f_s}:${r.ont_id}` === id);
    assert.strictEqual(rows.length, 6);
    assert.strictEqual(by("0/1:4").rx_power, -21.19);
    assert.strictEqual(by("0/1:4").vendor_id, "HWTC");
    // 0/1:3 is offline but listed in opm-diag -> must be ignored
    assert.strictEqual(by("0/1:3").rx_power, null);
    assert.strictEqual(by("0/1:3").distance, null);
    assert.strictEqual(by("0/1:1").status, "offline");
    assert.strictEqual(by("0/1:1").onu_mac, "54:93:59:21:3C:92");
    assert.strictEqual(by("0/1:4").pon, "epon0/1");
});

await ok("N/A optical values become null, never 0", async () => {
    const r = parseOpmDiag("EPON0/1:4   N/A  N/A  --  N/A  -")[0];
    assert.deepStrictEqual(
        [r.temperature, r.voltage, r.bias_current, r.tx_power, r.rx_power],
        [null, null, null, null, null]);
});

// ---- fake VSOL telnet server (login, enable, --More-- paging, IAC) ----
function fakeOlt({ failLogin = false, modal = false } = {}) {
    const server = net.createServer(socket => {
        let state = "login", buf = "", mode = "";
        socket.write(Buffer.from([255, 253, 1, 255, 251, 3]));            // IAC DO ECHO, IAC WILL SGA
        socket.write("\r\nHello, this is epon olt platform (version 1.00).\r\nUser Access Verification\r\nLogin: ");
        socket.on("data", d => {
            const text = d.toString("latin1").replace(/\xff[\xfb-\xfe]./g, "");
            buf += text;
            let i;
            while ((i = buf.indexOf("\r\n")) !== -1) {
                const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
                if (state === "login") { state = "pass"; socket.write("Password: "); }
                else if (state === "pass") {
                    if (failLogin || line !== "secret") { socket.write("\r\nAuthentication failed\r\nLogin: "); state = "login"; }
                    else { state = "user"; socket.write("\r\nepon-olt>"); }
                }
                else if (modal && line === "show running-config") socket.write(`${line}\r\ninterface epon 0/1\r\ninterface epon 0/2\r\nepon-olt#`);
                else if (modal && line === "configure terminal") socket.write(`${line}\r\nepon-olt(config)#`);
                else if (modal && /^interface epon /.test(line)) { mode = line.split(" ")[2]; socket.write(`${line}\r\nepon-olt(config-pon-${mode})#`); }
                else if (modal && line === "end") { mode = ""; socket.write(`${line}\r\nepon-olt#`); }
                else if (modal && !mode && /^show onu /.test(line)) socket.write(`${line}\r\n% Unknown command\r\nepon-olt#`);
                else if (modal && mode === "0/2" && /^show onu /.test(line)) socket.write(`${line}\r\nepon-olt(config-pon-${mode})#`);
                else if (modal && mode && line === "show onu status all") socket.write(`${line}\r\nONU-ID      Status    MAC Address         Distance(m) RTT(TQ)\r\nEPON${mode}:1   online    a2:3d:09:21:26:e0    79           144\r\nepon-olt(config-pon-${mode})#`);
                else if (modal && mode) socket.write(`${line}\r\nepon-olt(config-pon-${mode})#`);
                else if (line === "enable") { state = "priv"; socket.write("enable\r\nepon-olt#"); }
                else if (line === "show onu status all") socket.write(`${line}\r\n${STATUS.replace(/\n/g, "\r\n")}\r\nepon-olt#`);
                else if (line === "show onu opm-diag") {
                    // paged: first half, --More--, then rest after a space
                    const L = OPM.split("\n");
                    socket.write(`${line}\r\n${L.slice(0, 2).join("\r\n")}\r\n --More-- `);
                    socket.once("data", () => socket.write(`\r${L.slice(2).join("\r\n")}\r\nepon-olt#`));
                }
                else if (line === "show onu baisc-info") socket.write(`${line}\r\n${BASIC.replace(/\n/g, "\r\n")}\r\nepon-olt#`);
                else socket.write(`${line}\r\n% Unknown command\r\nepon-olt#`);
            }
        });
    });
    return new Promise(res => server.listen(0, "127.0.0.1", () => res(server)));
}

await ok("driver: login+enable, IAC ignored, paging, merges three commands", async () => {
    const server = await fakeOlt();
    const d = new VsolDriver({ ip: "127.0.0.1", port: server.address().port, username: "admin", password: "secret", timeout: 8000 });
    try {
        const info = await d.testConnection();
        assert.strictEqual(info.success, true);
        assert.strictEqual(info.version, "1.00");
        const rows = await d.getONUList();
        assert.strictEqual(rows.length, 6);
        const online = rows.filter(r => r.status === "online");
        assert.strictEqual(online.length, 2);
        assert.strictEqual(rows.find(r => r.ont_id === 12).rx_power, -20.09);   // line after --More--
        assert.strictEqual(rows.find(r => r.ont_id === 12).model_id, "D701");
        assert.deepStrictEqual(d.opticalErrors, []);
    } finally { d.disconnect(); server.close(); }
});

await ok("driver: firmware that only accepts show onu inside interface epon -> per-PON fallback", async () => {
    const server = await fakeOlt({ modal: true });
    const d = new VsolDriver({ ip: "127.0.0.1", port: server.address().port, username: "admin", password: "secret", timeout: 8000 });
    try {
        const rows = await d.getONUList();
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].pon, "epon0/1");
        assert.strictEqual(rows[0].status, "online");
        assert.strictEqual(rows[0].onu_mac, "A2:3D:09:21:26:E0");
    } finally { d.disconnect(); server.close(); }
});

await ok("driver: wrong password -> clear login error", async () => {
    const server = await fakeOlt({ failLogin: true });
    const d = new VsolDriver({ ip: "127.0.0.1", port: server.address().port, username: "admin", password: "bad", timeout: 5000 });
    try {
        await assert.rejects(() => d.connect(), /login failed/i);
    } finally { d.disconnect(); server.close(); }
});

await ok("registered: driverFor('V-SOL'/'vsol') + sync-manager vendor", async () => {
    const svc = require(root + "/services/olt-sync.service");
    assert.ok(svc.driverFor({ vendor: "vsol", ip: "1.1.1.1" }) instanceof VsolDriver);
    assert.ok(svc.driverFor({ vendor: "V-SOL", ip: "1.1.1.1" }) instanceof VsolDriver);
    const vendorMod = require(root + "/sync/vendors/vsol/sync");
    assert.strictEqual(vendorMod.vendor, "vsol");
});

console.log(`\n${passed} tests passed`);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
