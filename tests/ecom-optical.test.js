'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { EcomDriver, parseOpticalInfo, parseBasicInfo } = require('../drivers/hardware/ecom');

// Verbatim excerpts of the real OLT output (probe 2026-10-28, OLT "Ecom 8s").
const OPTICAL = `-------------------------------------------------------------------------------------------------
  F/S  P  ONT  ONT                 Voltage   Tx optical   Rx optical   Laser bias   Temperature
          ID   MAC                 (V)       power(dBm)   power(dBm)   current(mA)  (C)
 ------------------------------------------------------------------------------------------------
  0/1  1  8    10:af:8f:76:f5:9d     3.27         2.32       -15.69        13.85         59.75
  0/1  1  9    4c:46:d1:a7:88:90     3.28         2.53       -20.81        16.10         42.82
  0/1  1  75   c0:7e:40:d0:1f:3f     3.31         1.71       -23.19        11.58         76.16
-------------------------------------------------------------------------------------------------
E08EP-4S+(config-epon-0/1)#`;

const BASIC = `----------------------------------------------------------------------------------------
  F/S  P  ONT MAC               Type  Distance  Up          Extended
          ID                          (m)       Time        Model
----------------------------------------------------------------------------------------
  0/1  1  8   10:AF:8F:76:F5:9D SFU   1279      0:01:55:17  0000
  0/1  1  9   4C:46:D1:A7:88:90 SFU   979       0:01:55:07  V601
  0/1  1  30  A2:5D:08:31:A2:C0 SFU   1054      0:01:55:36   ONU
----------------------------------------------------------------------------------------
E08EP-4S+(config-epon-0/1)#`;

test('parses real optical-info (Tx/Rx order, voltage, bias, temperature)', () => {
    const rows = parseOpticalInfo(OPTICAL);

    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
        f_s: '0/1', pon: 1, ont_id: 8, onu_mac: '10:AF:8F:76:F5:9D',
        voltage: 3.27, tx_power: 2.32, rx_power: -15.69,
        bias_current: 13.85, temperature: 59.75
    });
});

test('parses real basic-info distance', () => {
    const rows = parseBasicInfo(BASIC);

    assert.equal(rows.length, 3);
    assert.equal(rows[0].distance, 1279);
    assert.equal(rows[2].ont_id, 30);
});

test('header / separator / prompt lines are ignored', () => {
    assert.equal(parseOpticalInfo('% Command incomplete.\nE08EP-4S+#').length, 0);
    assert.equal(parseBasicInfo('').length, 0);
});

function fakeDriver(onCommand) {
    const d = new EcomDriver({ ip: '1.1.1.1' });
    d.prompt = 'E08EP-4S+#';
    d.command = async (cmd) => {
        const out = onCommand(cmd);
        if (cmd === 'config') d.prompt = 'E08EP-4S+(config)#';
        if (/^interface epon/.test(cmd)) d.prompt = 'E08EP-4S+(config-epon-0/1)#';
        if (cmd === 'exit') d.prompt = 'E08EP-4S+(config)#';
        return out;
    };
    return d;
}

const ROWS = [
    { f_s: '0/1', pon: 1, ont_id: 8, onu_mac: '10:AF:8F:76:F5:9D' },
    { f_s: '0/1', pon: 1, ont_id: 9, onu_mac: '4C:46:D1:A7:88:90' },
    // same id, different MAC than the OLT reports -> must not be filled
    { f_s: '0/1', pon: 1, ont_id: 30, onu_mac: '11:22:33:44:55:66' }
];

test('collectOptical merges optical + distance by F/S, PON, ONT-ID and MAC', async () => {
    const seen = [];
    const d = fakeDriver(cmd => {
        seen.push(cmd);
        if (cmd === 'show ont optical-info 1 all') return OPTICAL;
        if (cmd === 'show ont basic-info 1 all') return BASIC;
        return 'ok';
    });

    const map = await d.collectOptical(ROWS);

    assert.deepEqual(seen, [
        'config', 'interface epon 0/1',
        'show ont optical-info 1 all', 'show ont basic-info 1 all', 'exit'
    ]);

    assert.equal(map.get('0/1:1:8').rx_power, -15.69);
    assert.equal(map.get('0/1:1:8').distance, 1279);
    assert.equal(map.get('0/1:1:9').temperature, 42.82);
    assert.equal(map.has('0/1:1:30'), false);
    assert.equal(d.opticalErrors.length, 0);
});

test('rejected optical command is reported, never thrown', async () => {
    const d = fakeDriver(cmd => /^show ont/.test(cmd) ? '% Unknown command.' : 'ok');
    const map = await d.collectOptical(ROWS);

    assert.equal(map.size, 0);
    assert.equal(d.opticalErrors.length, 2);
});

test('enterConfig is skipped when already in config mode', async () => {
    const calls = [];
    const d = fakeDriver(cmd => { calls.push(cmd); return ''; });
    d.prompt = 'E08EP-4S+(config)#';

    await d.enterConfig();
    assert.deepEqual(calls, []);
});
