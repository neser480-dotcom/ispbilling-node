'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');

/* Load the controller with a fake mysql2 so no database is needed. */
function loadController(fake) {
    const orig = Module._load;
    Module._load = function (request, ...rest) {
        if (request === 'mysql2/promise') return { createPool: () => fake };
        return orig.call(this, request, ...rest);
    };
    delete require.cache[require.resolve('../controllers/olt/olt.controller')];
    try { return require('../controllers/olt/olt.controller'); } finally { Module._load = orig; }
}

function fakeDb(counts, { missing = [] } = {}) {
    const log = [];
    const run = async (sql, p = []) => {
        const q = sql.replace(/\s+/g, ' ').trim();
        log.push({ q, p });
        const table = ['onu_user_mapping', 'onu_ppp_info', 'onu_customer_links']
            .find(t => q.includes(`FROM ${t} AS t`));
        if (table && missing.includes(table)) {
            throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
        }
        if (/^SELECT COUNT\(\*\) AS n FROM onu AS o LEFT JOIN olts/.test(q)) return [[{ n: counts.onu }]];
        if (/^SELECT COUNT/.test(q)) return [[{ n: counts[table] }]];
        return [{ affectedRows: 1 }];
    };
    const conn = {
        execute: run, release() {}, beginTransaction: async () => {},
        commit: async () => {}, rollback: async () => {}
    };
    return { log, execute: run, getConnection: async () => conn };
}

function res() {
    return { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test('orphan routes are registered before the /:id routes that could shadow them', () => {
    const src = fs.readFileSync(require.resolve('../routes/olt/olt.js'), 'utf8');
    assert.ok(src.indexOf('router.delete("/orphans"') > -1);
    assert.ok(src.indexOf('router.delete("/orphans"') < src.indexOf('router.delete("/:id"'));
});

test('preview counts only, deletes nothing; tenant scoped', async () => {
    const db = fakeDb({ onu_user_mapping: 3, onu_ppp_info: 2, onu_customer_links: 0 });
    const c = loadController(db);
    const r = res();

    await c.orphans({ session: { user_id: 1, company_id: 33, role: 'admin' } }, r);

    assert.equal(r.body.counts.onu_user_mapping, 3);
    assert.equal(r.body.counts.onu_ppp_info, 2);
    assert.equal(r.body.counts.onu, undefined); // not a super admin
    assert.ok(!db.log.some(x => /^DELETE/.test(x.q)));
    assert.ok(db.log.every(x => /company_id = \?/.test(x.q)));
    assert.ok(db.log.every(x => x.p[0] === 33));
});

test('cleanup requires confirm and only deletes ONU-less rows of this company', async () => {
    const db = fakeDb({ onu_user_mapping: 3, onu_ppp_info: 2, onu_customer_links: 0 });
    const c = loadController(db);

    const noConfirm = res();
    await c.cleanOrphans({ session: { user_id: 1, company_id: 33 }, body: {} }, noConfirm);
    assert.notEqual(noConfirm.code, 200);
    assert.ok(!db.log.some(x => /^DELETE/.test(x.q)));

    const r = res();
    await c.cleanOrphans({ session: { user_id: 1, company_id: 33 }, body: { confirm: true } }, r);

    const deletes = db.log.filter(x => /^DELETE/.test(x.q));
    assert.equal(deletes.length, 2); // customer_links has 0 orphans: no delete
    assert.ok(deletes.every(x => /WHERE o\.id IS NULL AND t\.company_id = \?/.test(x.q) && x.p[0] === 33));
    assert.equal(r.body.success, true);
});

test('missing optional table is skipped; only super admin touches ONU rows without an OLT', async () => {
    const db = fakeDb({ onu: 4, onu_user_mapping: 1, onu_ppp_info: 0, onu_customer_links: 0 },
        { missing: ['onu_customer_links'] });
    const c = loadController(db);
    const r = res();

    await c.cleanOrphans({ session: { user_id: 1, role: 'super_admin' }, body: { confirm: true } }, r);

    assert.equal(r.body.counts.onu, 4);
    assert.equal(r.body.counts.onu_customer_links, null);
    assert.ok(db.log.some(x => /^DELETE o FROM onu AS o LEFT JOIN olts/.test(x.q)));
});

/* ---------- delete one ONU (row button) ---------- */

function onuDb({ onuExists = true } = {}) {
    const log = [];
    const run = async (sql, p = []) => {
        const q = sql.replace(/\s+/g, ' ').trim();
        log.push({ q, p });
        if (/^SELECT ol\.\* FROM olts/.test(q)) return [[{ id: p[0], company_id: 33 }]];
        if (/^SELECT id FROM onu WHERE id = \? AND olt_id = \?/.test(q)) {
            return [onuExists ? [{ id: p[0] }] : []];
        }
        return [{ affectedRows: 1 }];
    };
    const conn = { execute: run, release() {}, beginTransaction: async () => {}, commit: async () => { log.push({ q: 'COMMIT', p: [] }); }, rollback: async () => { log.push({ q: 'ROLLBACK', p: [] }); } };
    return { log, execute: run, getConnection: async () => conn };
}

const onuReq = (body = { confirm: true, csrf_token: 't' }) => ({
    params: { id: '45', onuId: '4029' },
    session: { user_id: 1, company_id: 33, csrf_token: 't' },
    headers: {},
    body
});

test('delete ONU removes its links and the ONU, in this company only', async () => {
    const db = onuDb();
    const c = loadController(db);
    const r = res();

    await c.removeOnu(onuReq(), r);

    assert.equal(r.body.success, true);
    const deletes = db.log.filter(x => /^DELETE/.test(x.q));
    assert.equal(deletes.length, 4); // 3 link tables + onu
    assert.ok(deletes.slice(0, 3).every(x => /onu_id = \? AND company_id = \?/.test(x.q) && x.p[0] === 4029 && x.p[1] === 33));
    assert.ok(/^DELETE FROM onu WHERE id = \? AND olt_id = \?/.test(deletes[3].q));
    assert.deepEqual(deletes[3].p, [4029, 45]);
});

test('delete ONU needs CSRF and confirm, and 404s for an ONU of another OLT', async () => {
    const db = onuDb();
    const c = loadController(db);

    const noCsrf = res();
    await c.removeOnu({ ...onuReq(), session: { user_id: 1, company_id: 33 } }, noCsrf);
    assert.equal(noCsrf.code, 403);

    const noConfirm = res();
    await c.removeOnu(onuReq({ csrf_token: 't' }), noConfirm);
    assert.notEqual(noConfirm.code, 200);

    const missing = onuDb({ onuExists: false });
    const c2 = loadController(missing);
    const r = res();
    await c2.removeOnu(onuReq(), r);
    assert.equal(r.code, 404);
    assert.ok(!missing.log.some(x => /^DELETE/.test(x.q)));
    assert.ok(missing.log.some(x => x.q === 'ROLLBACK'));
    assert.ok(!db.log.some(x => /^DELETE/.test(x.q)));
});
