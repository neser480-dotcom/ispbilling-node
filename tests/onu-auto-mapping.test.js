'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeMac, extractMacs, indexCustomers, indexSessions, decide, autoMapOnus
} = require('../drivers/services/onu-auto-mapping.service');

const {
    loadConfig, parseLearnedMacs, collectLearnedMacs
} = require('../drivers/hardware/cdata-learned-mac');

/* ---------- fake mysql2 pool (in-memory, only what the service runs) ---------- */

function fakePool(db) {
    const writes = [];

    const run = async (sql, p = []) => {
        const q = sql.replace(/\s+/g, ' ').trim();

        if (/^SELECT id FROM olts/.test(q)) {
            return [db.olts.filter(o => o.id === p[0] && o.company_id === p[1])];
        }
        if (/FROM onu AS o WHERE o.olt_id = \?/.test(q) && /AS mac/.test(q)) {
            return [db.onu.filter(o => o.olt_id === p[0]).map(o => ({
                id: o.id, legacy_customer_id: o.customer_id, mac: o.onu_mac || null
            }))];
        }
        if (/FROM onu_user_mapping AS m JOIN onu AS o ON o.id = m.onu_id WHERE m.company_id = \?$/.test(q)) {
            return [db.map.filter(m => m.company_id === p[0] && db.onu.some(o => o.id === m.onu_id))];
        }
        if (/JOIN olts AS ol ON ol.id = o.olt_id WHERE ol.company_id = \? AND o.customer_id IS NOT NULL/.test(q)) {
            return [db.onu.filter(o => o.customer_id).map(o => ({ id: o.id, customer_id: o.customer_id }))];
        }
        if (/FROM customers WHERE company_id = \? AND deleted_at IS NULL AND \(/.test(q)) {
            return [db.customers.filter(c => c.company_id === p[0] && !c.deleted_at)];
        }
        if (/^SELECT customer_id FROM onu WHERE id = \? AND olt_id = \? FOR UPDATE/.test(q)) {
            return [db.onu.filter(o => o.id === p[0] && o.olt_id === p[1])];
        }
        if (/FROM onu_user_mapping WHERE onu_id = \?/.test(q)) {
            return [db.map.filter(m => m.onu_id === p[0] && m.company_id === p[1] && m.olt_id === p[2])];
        }
        if (/^SELECT id FROM customers WHERE id = \?/.test(q)) {
            return [db.customers.filter(c => c.id === p[0] && c.company_id === p[1] && !c.deleted_at)];
        }
        if (/^SELECT m.onu_id FROM onu_user_mapping AS m JOIN onu AS o/.test(q)) {
            return [db.map.filter(m => m.company_id === p[0] && m.customer_id === p[1] && db.onu.some(o => o.id === m.onu_id))];
        }
        if (/^SELECT o.id FROM onu AS o JOIN olts/.test(q)) {
            return [db.onu.filter(o => o.customer_id === p[1])];
        }
        if (/^UPDATE onu_user_mapping SET customer_id = \?/.test(q)) {
            const row = db.map.find(m => m.onu_id === p[1] && m.company_id === p[2] && m.customer_id == null);
            if (!row) return [{ affectedRows: 0 }];
            row.customer_id = p[0];
            return [{ affectedRows: 1 }];
        }
        if (/^INSERT INTO onu_user_mapping/.test(q)) {
            if (db.map.some(m => m.onu_id === p[2])) {
                throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            }
            db.map.push({ company_id: p[0], olt_id: p[1], onu_id: p[2], customer_id: p[3] });
            writes.push(q);
            return [{}];
        }
        if (/^SELECT onu_id, customer_id FROM onu_customer_links WHERE company_id = \?/.test(q)) {
            if (!db.extra) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
            return [db.extra.filter(e => e.company_id === p[0])];
        }
        if (/^SELECT onu_id FROM onu_customer_links WHERE company_id = \? AND customer_id = \?/.test(q)) {
            return [db.extra.filter(e => e.company_id === p[0] && e.customer_id === p[1])];
        }
        if (/^INSERT INTO onu_customer_links/.test(q)) {
            if (db.extra.some(e => e.company_id === p[0] && e.customer_id === p[3])) {
                throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            }
            db.extra.push({ company_id: p[0], olt_id: p[1], onu_id: p[2], customer_id: p[3] });
            return [{}];
        }
        if (/^SELECT p.onu_id FROM onu_ppp_info AS p JOIN onu AS o/.test(q)) {
            if (!db.ppp) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
            return [db.ppp.filter(x => x.company_id === p[0] && x.customer_id === p[1] && db.onu.some(o => o.id === x.onu_id))];
        }
        if (/^DELETE p FROM onu_ppp_info AS p LEFT JOIN onu/.test(q)) {
            if (!db.ppp) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
            db.ppp = db.ppp.filter(x => !(x.company_id === p[0] && x.customer_id === p[1] && !db.onu.some(o => o.id === x.onu_id)));
            return [{}];
        }
        if (/^SELECT 1 FROM onu_ppp_info LIMIT 1/.test(q)) {
            if (!db.ppp) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
            return [[]];
        }
        if (/^SELECT onu_id, customer_id FROM onu_user_mapping WHERE company_id = \? AND olt_id = \? AND customer_id IS NOT NULL/.test(q)) {
            return [db.map.filter(m => m.company_id === p[0] && m.olt_id === p[1] && m.customer_id != null)];
        }
        if (/^SELECT id, customer_id FROM onu WHERE olt_id = \?/.test(q)) {
            return [db.onu.filter(o => o.olt_id === p[0] && o.customer_id)
                .map(o => ({ id: o.id, customer_id: o.customer_id }))];
        }
        if (/^INSERT INTO onu_ppp_info/.test(q)) {
            const row = {
                company_id: p[0], olt_id: p[1], onu_id: p[2], customer_id: p[3],
                pppoe_username: p[4], caller_id: p[5], ip_address: p[6]
            };
            const i = db.ppp.findIndex(x => x.company_id === p[0] && x.customer_id === p[3]);
            if (i >= 0) { if (db.ppp[i].onu_id === p[2]) db.ppp[i] = row; } else db.ppp.push(row);
            return [{}];
        }
        if (/^UPDATE onu SET ip_address = \? WHERE id = \? AND olt_id = \? AND \(ip_address IS NULL OR ip_address <> \?\)/.test(q)) {
            const o = db.onu.find(x => x.id === p[1]);
            if (o && o.ip_address !== p[0]) o.ip_address = p[0];
            return [{}];
        }
        if (/^UPDATE onu SET ip_address/.test(q)) {
            const o = db.onu.find(x => x.id === p[1]);
            if (o && !o.ip_address) o.ip_address = p[0];
            return [{}];
        }
        throw new Error('Unexpected SQL: ' + q);
    };

    const conn = {
        execute: run,
        query: async () => [[]],
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => { db.rolledBack = true; },
        release() {}
    };

    return { getConnection: async () => conn, writes };
}

function baseDb() {
    return {
        olts: [{ id: 1, company_id: 10 }],
        onu: [
            { id: 1, olt_id: 1, onu_mac: 'CC:2D:21:1D:F6:47', customer_id: null },
            { id: 2, olt_id: 1, onu_mac: '84:16:F9:FC:A0:77', customer_id: null },
            { id: 3, olt_id: 1, onu_mac: '04:95:E6:95:E7:80', customer_id: null },
            { id: 4, olt_id: 1, onu_mac: '00:11:41:16:8C:D6', customer_id: null }
        ],
        map: [],
        customers: [
            { id: 100, company_id: 10, onu_mac: 'cc-2d-21-1d-f6-47', router_mac: '', pppoe_username: 'rubel' },
            { id: 101, company_id: 10, onu_mac: '', router_mac: 'E4:2D:7B:01:95:0F', pppoe_username: 'faruk' },
            { id: 102, company_id: 10, onu_mac: '', router_mac: 'AA:BB:CC:00:00:01', pppoe_username: 'dup1' },
            { id: 103, company_id: 10, onu_mac: '', router_mac: 'AA:BB:CC:00:00:01', pppoe_username: 'dup2' },
            { id: 900, company_id: 99, onu_mac: '84:16:F9:FC:A0:77', router_mac: '', pppoe_username: 'other-tenant' }
        ]
    };
}

/* ---------- MAC helpers ---------- */

test('normalizeMac accepts common formats and rejects junk', () => {
    assert.equal(normalizeMac('cc-2d-21-1d-f6-47'), 'CC:2D:21:1D:F6:47');
    assert.equal(normalizeMac('cc2d.211d.f647'), 'CC:2D:21:1D:F6:47');
    assert.equal(normalizeMac('00:00:00:00:00:00'), null);
    assert.equal(normalizeMac('FF:FF:FF:FF:FF:FF'), null);
    assert.equal(normalizeMac('01:00:5E:00:00:01'), null); // multicast
    assert.equal(normalizeMac('abc'), null);
});

test('extractMacs reads several MACs from one cell', () => {
    assert.deepEqual(
        extractMacs('CC:2D:21:1D:F6:47, e42d7b01950f').sort(),
        ['CC:2D:21:1D:F6:47', 'E4:2D:7B:01:95:0F']
    );
});

/* ---------- decisions ---------- */

test('tenant isolation: other company customer is never linked', async () => {
    const db = baseDb();
    await autoMapOnus(fakePool(db), { companyId: 10, oltId: 1 });
    assert.ok(!db.map.some(m => m.customer_id === 900));
});

test('two customers with the same MAC stay unlinked (ambiguous)', async () => {
    const db = baseDb();
    const r = await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1,
        entries: [{ onu_mac: '04:95:E6:95:E7:80', learned_macs: ['AA:BB:CC:00:00:01'] }]
    });

    assert.equal(r.ambiguous, 1);
    assert.ok(!db.map.some(m => m.onu_id === 3));
});

test('existing mapping is never overwritten', async () => {
    const db = baseDb();
    db.map.push({ company_id: 10, olt_id: 1, onu_id: 1, customer_id: 101 });

    const r = await autoMapOnus(fakePool(db), { companyId: 10, oltId: 1 });

    assert.equal(db.map.find(m => m.onu_id === 1).customer_id, 101);
    assert.equal(r.alreadyLinked, 1);
    assert.equal(r.linked, 0);
});

test('manual unlink (NULL customer row) is respected when protection is on', async () => {
    const db = baseDb();
    db.map.push({ company_id: 10, olt_id: 1, onu_id: 1, customer_id: null });

    const r = await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, relinkUnlinked: false
    });

    assert.equal(r.manuallyUnlinked, 1);
    assert.equal(db.map.find(m => m.onu_id === 1).customer_id, null);
});

test('legacy onu.customer_id counts as linked', async () => {
    const db = baseDb();
    db.onu[0].customer_id = 555;

    const r = await autoMapOnus(fakePool(db), { companyId: 10, oltId: 1 });

    assert.equal(r.alreadyLinked, 1);
    assert.equal(db.map.length, 0);
});

test('customer already linked to another ONU is a conflict, not a relink', async () => {
    const db = baseDb();
    db.map.push({ company_id: 10, olt_id: 1, onu_id: 4, customer_id: 100 });

    const r = await autoMapOnus(fakePool(db), { companyId: 10, oltId: 1 });

    assert.equal(r.conflicts, 1);
    assert.ok(!db.map.some(m => m.onu_id === 1));
});

test('same customer matched by two ONUs links neither', async () => {
    const db = baseDb();
    const r = await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1,
        entries: [{ onu_mac: '00:11:41:16:8C:D6', learned_macs: ['CC:2D:21:1D:F6:47'] }]
    });

    assert.equal(r.ambiguous, 2);
    assert.equal(db.map.length, 0);
});

test('dry run writes nothing', async () => {
    const db = baseDb();
    const pool = fakePool(db);
    const r = await autoMapOnus(pool, { companyId: 10, oltId: 1, dryRun: true });

    assert.equal(r.wouldLink, 1);
    assert.equal(r.linked, 0);
    assert.equal(pool.writes.length, 0);
});

test('wrong company cannot map an OLT', async () => {
    await assert.rejects(
        autoMapOnus(fakePool(baseDb()), { companyId: 99, oltId: 1 }),
        /OLT not found/
    );
});

test('pure decide(): ONU without any MAC is reported, not linked', () => {
    const d = decide({
        onus: [{ id: 1, mac: null, legacyCustomerId: null }],
        learned: new Map(), mappings: new Map(), linkedElsewhere: new Map(),
        index: indexCustomers([]), sessionsByMac: indexSessions([])
    });
    assert.equal(d[0].status, 'no_mac');
});

/* ---------- learned MAC parsing / collection ---------- */

test('loadConfig: verified default, "off" disables, non-show commands rejected', () => {
    assert.equal(loadConfig('off'), null);
    assert.equal(loadConfig('').commands[0].perPort, true);
    assert.throws(() => loadConfig(JSON.stringify({
        commands: [{ command: 'delete all', lineRegex: '(?<mac>x)(?<ont>y)' }]
    })), /read-only/);
});

test('parseLearnedMacs ignores lines without MAC and ONT id', () => {
    const rx = /^(?<mac>[0-9a-f:]{17})\s+(?<ont>\d+)$/i;
    const rows = parseLearnedMacs(
        'header\nE4:2D:7B:01:95:0F 7\ngarbage\nFF:FF:FF:FF:FF:FF 3\nE4:2D:7B:01:95:0F x',
        rx, 2
    );
    assert.deepEqual(rows, [{ pon: 2, ont_id: 7, mac: 'E4:2D:7B:01:95:0F' }]);
});

test('collectLearnedMacs attributes by pon+ont and survives rejected commands', async () => {
    const calls = [];
    const driver = {
        command: async cmd => {
            calls.push(cmd);
            if (/^interface/.test(cmd) || cmd === 'exit') return 'ok\nOLT#';
            return 'E4:2D:7B:01:95:0F 7';
        },
        enterConfig: async () => {}
    };

    const cfg = loadConfig(JSON.stringify({
        commands: [{
            command: 'show test {pon}', perPon: true,
            lineRegex: '^(?<mac>[0-9a-f:]{17})\\s+(?<ont>\\d+)$'
        }]
    }));

    const out = await collectLearnedMacs(driver, [
        { fs: '0/0', pon: 1, ont_id: 7, onu_mac: 'CC:2D:21:1D:F6:47' },
        { fs: '0/0', pon: 2, ont_id: 7, onu_mac: '84:16:F9:FC:A0:77' }
    ], cfg);

    assert.equal(out.supported, true);
    assert.equal(out.entries.length, 2);
    assert.ok(calls.includes('show test 1') && calls.includes('show test 2'));
});

test('collectLearnedMacs reports unsupported when not configured', async () => {
    const out = await collectLearnedMacs({}, [], null);
    assert.equal(out.supported, false);
    assert.deepEqual(out.entries, []);
});

/* ---------- real C-Data output (captured from the user's OLT) ---------- */

const REAL_ONT_OUTPUT = `-----------------------------------------------------------------------------
 Total: 1
-----------------------------------------------------------------------------
 MAC                 VLAN   Port          ONT-Id  MAC-Type
-----------------------------------------------------------------------------
 CC:2D:21:1D:F6:47   201    pon0/0/1      3       dynamic
-----------------------------------------------------------------------------
`;

const REAL_ONT_REGEX =
    '^(?<mac>[0-9a-f]{2}(?::[0-9a-f]{2}){5})\\s+\\d+\\s+pon\\d+/\\d+/(?<pon>\\d+)\\s+(?<ont>\\d+)\\s+dynamic$';

test('parses the real "show mac-address ont 0/0/1 3" output', () => {
    const rows = parseLearnedMacs(REAL_ONT_OUTPUT, new RegExp(REAL_ONT_REGEX, 'i'));
    assert.deepEqual(rows, [{ pon: 1, ont_id: 3, mac: 'CC:2D:21:1D:F6:47' }]);
});

test('perOnt collection runs one command per ONU with the real format', async () => {
    const calls = [];
    const driver = {
        command: async cmd => {
            calls.push(cmd);
            return cmd === 'show mac-address ont 0/0/1 3' ? REAL_ONT_OUTPUT : 'Total: 0\nOLT#';
        },
        enterConfig: async () => {}
    };

    const cfg = loadConfig(JSON.stringify({
        commands: [{
            command: 'show mac-address ont {iface}/{pon} {ont}',
            perOnt: true,
            lineRegex: REAL_ONT_REGEX
        }]
    }));

    const out = await collectLearnedMacs(driver, [
        { fs: '0/0', pon: 1, ont_id: 3, onu_mac: 'CC:2D:21:1D:F6:47' },
        { fs: '0/0', pon: 1, ont_id: 4, onu_mac: '84:16:F9:FC:A0:77' }
    ], cfg);

    assert.deepEqual(calls, [
        'show mac-address ont 0/0/1 3',
        'show mac-address ont 0/0/1 4'
    ]);
    assert.deepEqual(out.entries, [
        { onu_mac: 'CC:2D:21:1D:F6:47', learned_macs: ['CC:2D:21:1D:F6:47'] }
    ]);
});

test('PPP session of another tenant username cannot link (unknown username)', async () => {
    const db = baseDb();
    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1,
        sessions: [{ mac: '84:16:F9:FC:A0:77', username: 'other-tenant', address: '1.1.1.1' }]
    });

    assert.ok(!db.map.some(m => m.customer_id === 900));
});

/* ---------- real "with-ont-location" output (captured, incl. paging noise) ---------- */

const REAL_PORT_OUTPUT = `-----------------------------------------------------------------------------
 Total: 5
-----------------------------------------------------------------------------
 MAC                 VLAN   Port          ONT-Id  MAC-Type
-----------------------------------------------------------------------------
 CC:BA:BD:1F:0D:BD   201    pon0/0/1      1       dynamic
 A0:7E:11:12:D3:B1   201    pon0/0/1      4       dynamic
                                    E0:D3:62:99:58:7B   201    pon0/0/1      4       dynamic
 CC:2D:21:1D:F6:47   201    pon0/0/1      3       dynamic
 F4:1E:57:3C:7E:3A   200    xge0/0/1      dynamic
-----------------------------------------------------------------------------
`;

test('default config parses with-ont-location output (several MACs per ONT, paging noise)', async () => {
    const calls = [];
    const driver = {
        command: async cmd => {
            calls.push(cmd);
            return /0\/0\/1/.test(cmd) ? REAL_PORT_OUTPUT : 'Total: 0\nOLT#';
        },
        enterConfig: async () => {}
    };

    const out = await collectLearnedMacs(driver, [
        { fs: '0/0', pon: 1, ont_id: 1, onu_mac: 'CC:BA:BD:1F:0D:BD' },
        { fs: '0/0', pon: 1, ont_id: 4, onu_mac: 'A0:7E:11:12:D3:B1' },
        { fs: '0/0', pon: 1, ont_id: 3, onu_mac: 'CC:2D:21:1D:F6:47' },
        { fs: '0/0', pon: 2, ont_id: 1, onu_mac: 'B8:3A:08:26:D1:B0' }
    ], loadConfig(''));

    assert.deepEqual(calls, [
        'show mac-address port epon 0/0/1 with-ont-location',
        'show mac-address port epon 0/0/2 with-ont-location'
    ]);

    const byOnu = Object.fromEntries(out.entries.map(e => [e.onu_mac, e.learned_macs.sort()]));
    assert.deepEqual(byOnu['A0:7E:11:12:D3:B1'], ['A0:7E:11:12:D3:B1', 'E0:D3:62:99:58:7B']);
    assert.deepEqual(byOnu['CC:2D:21:1D:F6:47'], ['CC:2D:21:1D:F6:47']);
    assert.equal(byOnu['B8:3A:08:26:D1:B0'], undefined);
});

test('PPP info: a customer that was NOT linked gets no row (conflict)', async () => {
    const db = baseDb();
    db.ppp = [];
    db.map.push({ company_id: 10, olt_id: 1, onu_id: 4, customer_id: 101 });

    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1,
        sessions: [{ mac: '84:16:F9:FC:A0:77', username: 'faruk', address: '10.0.0.5' }]
    });

    assert.ok(!db.ppp.some(r => r.onu_id === 2));
});

test('PPP info: dry run saves nothing', async () => {
    const db = baseDb();
    db.ppp = [];
    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, dryRun: true,
        sessions: [{ mac: '84:16:F9:FC:A0:77', username: 'faruk', address: '10.0.0.5' }]
    });

    assert.equal(db.ppp.length, 0);
});

/* ---------- switch ONU: many customers behind one ONU (onu_ppp_info) ---------- */

function switchDb(count = 5) {
    const db = baseDb();
    db.ppp = [];

    // master ONU 3 + `count` PPPoE customers behind its switch
    for (let i = 1; i <= count; i++) {
        db.customers.push({
            id: 300 + i, company_id: 10, onu_mac: '', router_mac: '',
            pppoe_username: `sw${i}`
        });
    }

    return db;
}

const macN = n => `10:00:00:00:00:${String(n).padStart(2, '0')}`;

const switchSessions = (count = 5) => Array.from({ length: count }, (_, i) => ({
    mac: macN(i + 1),
    username: `sw${i + 1}`,
    address: `10.10.20.${i + 1}`
}));

const switchEntry = (count = 5) => [{
    onu_mac: '04:95:E6:95:E7:80',
    learned_macs: Array.from({ length: count }, (_, i) => macN(i + 1))
}];

for (const count of [2, 5, 10]) {
    test(`switch ONU with ${count} customers: all are stored under the one ONU`, async () => {
        const db = switchDb(count);

        const r = await autoMapOnus(fakePool(db), {
            companyId: 10, oltId: 1,
            entries: switchEntry(count), sessions: switchSessions(count)
        });

        const rows = db.ppp.filter(x => x.onu_id === 3);

        assert.equal(rows.length, count);
        assert.deepEqual(
            rows.map(x => x.customer_id).sort((a, b) => a - b),
            Array.from({ length: count }, (_, i) => 301 + i)
        );
        assert.equal(r.multiOnu, 1);
        assert.equal(r.multiCustomers, count);
        assert.equal(r.ambiguous, 0);
        // a switch has no single primary customer
        assert.ok(!db.map.some(m => m.onu_id === 3));
        // each customer keeps its own caller-id and IP
        assert.equal(rows.find(x => x.customer_id === 301).caller_id, '10:00:00:00:00:01');
        assert.equal(rows.find(x => x.customer_id === 301).ip_address, '10.10.20.1');
    });
}

test('switch ONU: re-running creates no duplicates', async () => {
    const db = switchDb(5);
    const pool = fakePool(db);
    const opts = { companyId: 10, oltId: 1, entries: switchEntry(5), sessions: switchSessions(5) };

    await autoMapOnus(pool, opts);
    await autoMapOnus(pool, opts);

    assert.equal(db.ppp.filter(x => x.onu_id === 3).length, 5);
});

test('switch ONU: a customer added later joins the same ONU', async () => {
    const db = switchDb(5);
    const pool = fakePool(db);

    await autoMapOnus(pool, {
        companyId: 10, oltId: 1, entries: switchEntry(3), sessions: switchSessions(3)
    });
    assert.equal(db.ppp.length, 3);

    await autoMapOnus(pool, {
        companyId: 10, oltId: 1, entries: switchEntry(5), sessions: switchSessions(5)
    });
    assert.equal(db.ppp.filter(x => x.onu_id === 3).length, 5);
});

test('switch ONU dry run writes nothing', async () => {
    const db = switchDb(5);

    const r = await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, dryRun: true,
        entries: switchEntry(5), sessions: switchSessions(5)
    });

    assert.equal(db.ppp.length, 0);
    assert.equal(r.multiOnu, 1);
});

test('customer linked to another ONU is never moved under the switch', async () => {
    const db = switchDb(3);
    db.map.push({ company_id: 10, olt_id: 1, onu_id: 4, customer_id: 302 });

    const r = await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, entries: switchEntry(3), sessions: switchSessions(3)
    });

    assert.ok(!db.ppp.some(x => x.customer_id === 302));
    assert.equal(db.ppp.filter(x => x.onu_id === 3).length, 2);
    assert.equal(r.pppConflicts, 1);
    assert.equal(db.map.find(m => m.onu_id === 4).customer_id, 302);
});

test('customer already stored under another ONU is not stolen', async () => {
    const db = switchDb(3);
    db.ppp.push({
        company_id: 10, olt_id: 1, onu_id: 4, customer_id: 301,
        pppoe_username: 'sw1', caller_id: '10:00:00:00:00:01', ip_address: '9.9.9.9'
    });

    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, entries: switchEntry(3), sessions: switchSessions(3)
    });

    assert.equal(db.ppp.find(x => x.customer_id === 301).onu_id, 4);
});

test('duplicate PPPoE username is never treated as a switch customer', async () => {
    const db = switchDb(2);
    db.customers.push({ id: 399, company_id: 10, onu_mac: '', router_mac: '', pppoe_username: 'sw1' });

    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, entries: switchEntry(2), sessions: switchSessions(2)
    });

    assert.ok(!db.ppp.some(x => x.pppoe_username === 'sw1'));
    assert.ok(db.ppp.some(x => x.pppoe_username === 'sw2'));
});

test('single customer behind an ONU is still linked normally, with caller-id saved', async () => {
    const db = switchDb(1);

    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, entries: switchEntry(1), sessions: switchSessions(1)
    });

    assert.ok(db.map.some(m => m.onu_id === 3 && m.customer_id === 301));
    assert.equal(db.ppp.length, 1);
});

test('other tenant PPP username cannot be stored', async () => {
    const db = switchDb(1);

    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1, entries: switchEntry(1),
        sessions: [{ mac: '10:00:00:00:00:01', username: 'other-tenant', address: '1.1.1.1' }]
    });

    assert.equal(db.ppp.length, 0);
});

/* ---------- OLT deleted and re-added: orphan links must not block mapping ---------- */

test('orphan link from a deleted OLT does not block single-customer mapping', async () => {
    const db = baseDb();
    // stale link: customer 100 pointed at ONU 999 of an OLT that was deleted
    db.map.push({ company_id: 10, olt_id: 77, onu_id: 999, customer_id: 100 });

    const r = await autoMapOnus(fakePool(db), { companyId: 10, oltId: 1 });

    assert.ok(db.map.some(m => m.onu_id === 1 && m.customer_id === 100));
    assert.equal(r.linked >= 1, true);
});

test('orphan onu_ppp_info row of a deleted OLT is replaced for a switch customer', async () => {
    const db = switchDb(3);
    db.ppp.push({
        company_id: 10, olt_id: 77, onu_id: 999, customer_id: 301,
        pppoe_username: 'sw1', caller_id: 'AA:AA:AA:AA:AA:AA', ip_address: '1.1.1.1'
    });

    await autoMapOnus(fakePool(db), {
        companyId: 10, oltId: 1,
        entries: switchEntry(3), sessions: switchSessions(3)
    });

    const rows = db.ppp.filter(x => x.onu_id === 3);
    assert.equal(rows.length, 3);
    assert.ok(!db.ppp.some(x => x.onu_id === 999));
});

test('a live link on an existing ONU is still never moved', async () => {
    const db = baseDb();
    db.onu.push({ id: 50, olt_id: 1, onu_mac: '70:00:00:00:00:01', customer_id: null });
    db.map.push({ company_id: 10, olt_id: 1, onu_id: 50, customer_id: 100 });

    await autoMapOnus(fakePool(db), { companyId: 10, oltId: 1 });

    assert.equal(db.map.filter(m => m.customer_id === 100).length, 1);
    assert.equal(db.map.find(m => m.customer_id === 100).onu_id, 50);
});
