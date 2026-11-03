'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadController(fake) {
    const orig = Module._load;
    Module._load = function (request, ...rest) {
        if (request === 'mysql2/promise') return { createPool: () => fake };
        return orig.call(this, request, ...rest);
    };
    delete require.cache[require.resolve('../controllers/olt/olt.controller')];
    try { return require('../controllers/olt/olt.controller'); } finally { Module._load = orig; }
}

function fakeDb({ routers = [{ id: 5, company_id: 33 }], olt = { id: 45, company_id: 33, mikrotik_id: 5, password: 'pw' } } = {}) {
    const log = [];
    const run = async (sql, p = []) => {
        const q = sql.replace(/\s+/g, ' ').trim();
        log.push({ q, p });
        if (/^SELECT id FROM mikrotik_servers WHERE id = \? AND company_id = \? AND deleted_at IS NULL/.test(q)) {
            return [routers.filter(r => r.id === p[0] && r.company_id === p[1])];
        }
        if (/^SELECT ol\.\* FROM olts/.test(q)) return [[olt]];
        if (/^SELECT id FROM olts WHERE name/.test(q)) return [[]];
        if (/^INSERT INTO olts/.test(q)) return [{ insertId: 99 }];
        return [{ affectedRows: 1 }];
    };
    const conn = { execute: run, release() {}, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {} };
    return { log, execute: run, getConnection: async () => conn };
}

const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const sess = { user_id: 1, company_id: 33 };
const form = (extra = {}) => ({
    vendor: 'ECom EPon', name: 'Ecom 8s', ip: '1.2.3.4', port: 23,
    username: 'u', password: 'p', pon_ports: 8, ...extra
});

test('create saves the chosen MikroTik on the OLT', async () => {
    const db = fakeDb();
    const c = loadController(db);
    const r = res();

    await c.create({ session: sess, body: form({ mikrotik_id: '5' }) }, r);

    assert.equal(r.code, 201);
    const ins = db.log.find(x => /^INSERT INTO olts/.test(x.q));
    assert.ok(/mikrotik_id/.test(ins.q));
    assert.equal(ins.p[2], 5);
});

test('create without a MikroTik stores NULL (still allowed)', async () => {
    const db = fakeDb();
    const c = loadController(db);
    const r = res();

    await c.create({ session: sess, body: form({ mikrotik_id: '' }) }, r);

    assert.equal(r.code, 201);
    assert.equal(db.log.find(x => /^INSERT INTO olts/.test(x.q)).p[2], null);
});

test('create rejects a MikroTik of another company or a bad id', async () => {
    const db = fakeDb({ routers: [{ id: 5, company_id: 99 }] });
    const c = loadController(db);

    const other = res();
    await c.create({ session: sess, body: form({ mikrotik_id: 5 }) }, other);
    assert.equal(other.code, 400);
    assert.ok(!db.log.some(x => /^INSERT INTO olts/.test(x.q)));

    const bad = res();
    await c.create({ session: sess, body: form({ mikrotik_id: 'abc' }) }, bad);
    assert.equal(bad.code, 400);
});

test('update keeps the saved MikroTik when the form does not send it', async () => {
    const db = fakeDb();
    const c = loadController(db);
    const r = res();

    await c.update({ session: sess, params: { id: '45' }, body: form() }, r);

    const up = db.log.find(x => /^UPDATE olts/.test(x.q));
    assert.equal(up.p[0], 5);
    assert.equal(r.body.success, true);
});

test('update changes or clears the MikroTik when the form sends it', async () => {
    const db = fakeDb({ routers: [{ id: 7, company_id: 33 }] });
    const c = loadController(db);

    const change = res();
    await c.update({ session: sess, params: { id: '45' }, body: form({ mikrotik_id: 7 }) }, change);
    assert.equal(db.log.filter(x => /^UPDATE olts/.test(x.q)).pop().p[0], 7);

    const clear = res();
    await c.update({ session: sess, params: { id: '45' }, body: form({ mikrotik_id: null }) }, clear);
    assert.equal(db.log.filter(x => /^UPDATE olts/.test(x.q)).pop().p[0], null);
});

test('update rejects a MikroTik from another company, nothing is written', async () => {
    const db = fakeDb({ routers: [{ id: 7, company_id: 99 }] });
    const c = loadController(db);
    const r = res();

    await c.update({ session: sess, params: { id: '45' }, body: form({ mikrotik_id: 7 }) }, r);

    assert.equal(r.code, 400);
    assert.ok(!db.log.some(x => /^UPDATE olts/.test(x.q)));
});

test('list returns mikrotik_id so the edit form can preselect it', async () => {
    const db = fakeDb();
    const c = loadController(db);
    const r = res();

    await c.list({ session: sess, query: {} }, r);

    assert.ok(/ol\.mikrotik_id/.test(db.log[0].q));
});
