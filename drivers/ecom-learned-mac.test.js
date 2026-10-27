'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadEcomConfig, collectEcomLearnedMacs } = require('../drivers/ecom-learned-mac');
const { parseLearnedMacs } = require('../drivers/cdata-learned-mac');

// Verbatim output of the real OLT (probe-output, 2026-10-27).
const REAL_0_1_1 = `-----------------------------------------------------------------------------
 Total: 6
-----------------------------------------------------------------------------
 MAC                 VLAN   Port          ONT-Id  MAC-Type
-----------------------------------------------------------------------------
 E8:65:D4:7E:55:48   301    epon0/1/1     14      dynamic
 B4:B0:24:DE:85:3B   301    epon0/1/1     15      dynamic
 B8:3A:08:2A:39:9F   301    epon0/1/1     18      dynamic
 D8:32:14:DE:E8:58   301    epon0/1/1     22      dynamic
 A0:7F:06:26:0B:C1   301    epon0/1/1     22      dynamic
 58:D9:D5:35:51:F0   301    epon0/1/1     25      dynamic
-----------------------------------------------------------------------------
E08EP-4S+(config)#`;

const cfg = () => loadEcomConfig('');

test('parses the real with-ont-location output', () => {
    const rows = parseLearnedMacs(REAL_0_1_1, cfg().commands[0].lineRegex, 1);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows[0], { pon: 1, ont_id: 14, mac: 'E8:65:D4:7E:55:48' });
    assert.equal(rows.filter(r => r.ont_id === 22).length, 2);
});

test('ignores uplink / header / total lines', () => {
    const text = ` F4:1E:57:3C:7E:3B   302   xge0/0/1   dynamic\n Total: 1\n MAC VLAN Port ONT-Id MAC-Type`;
    assert.equal(parseLearnedMacs(text, cfg().commands[0].lineRegex, 1).length, 0);
});

test('collect: one command per PON, attributes by f_s/pon/ont', async () => {
    const seen = [];
    const driver = {
        async command(c) {
            seen.push(c);
            return c === 'show mac-address port pon 0/1/1 with-ont-location'
                ? REAL_0_1_1 : 'Total: 0';
        }
    };

    const rows = [
        { f_s: '0/1', pon: 1, ont_id: 22, onu_mac: '00:D3:9E:EE:F4:EE' },
        { f_s: '0/1', pon: 1, ont_id: 14, onu_mac: '10:AF:8F:76:F5:9D' },
        { f_s: '0/1', pon: 1, ont_id: 99, onu_mac: '4C:46:D1:A7:88:90' },
        { f_s: '0/2', pon: 4, ont_id: 1, onu_mac: '80:F1:A8:5B:41:74' }
    ];

    const out = await collectEcomLearnedMacs(driver, rows, cfg());

    assert.deepEqual(seen.sort(), [
        'show mac-address port pon 0/1/1 with-ont-location',
        'show mac-address port pon 0/2/4 with-ont-location'
    ]);

    const by = Object.fromEntries(out.entries.map(e => [e.onu_mac, e.learned_macs.sort()]));
    assert.deepEqual(by['00:D3:9E:EE:F4:EE'], ['A0:7F:06:26:0B:C1', 'D8:32:14:DE:E8:58']);
    assert.deepEqual(by['10:AF:8F:76:F5:9D'], ['E8:65:D4:7E:55:48']);
    assert.equal(by['4C:46:D1:A7:88:90'], undefined);
    assert.equal(out.supported, true);
});

test('rejected command is reported, not thrown', async () => {
    const driver = { async command() { return '% Unknown command.'; } };
    const out = await collectEcomLearnedMacs(driver,
        [{ f_s: '0/1', pon: 1, ont_id: 1, onu_mac: '10:AF:8F:76:F5:9D' }], cfg());
    assert.equal(out.entries.length, 0);
    assert.equal(out.errors.length, 1);
});

test('off disables collection', async () => {
    const out = await collectEcomLearnedMacs({}, [], loadEcomConfig('off'));
    assert.equal(out.supported, false);
});
