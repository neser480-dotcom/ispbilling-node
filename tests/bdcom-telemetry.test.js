'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const t = require('../services/olt/bdcom-telemetry');
const { buildDerivedEvents } = require('../services/olt/olt-monitor.service');

// Verbatim from a real BDCOM P3310D probe (2026-11-26).
const VERSION = `BDCOM(tm) P3310D Software, Version 10.1.0F Build 103950
Copyright by Shanghai Baud Data Communication CO. LTD.
ROM: System Bootstrap, Version 0.4.2, Serial num:00325017791
hardware version:A
Base ethernet MAC Address: 00:55:b1:4a:c7:7e
DORICHOR-BABU uptime is 94:14:33:42, The current time: 1970-4-5 14:33:42
DORICHOR-BABU#`;

const TEMP = `upper temperature threshold is 75 degree
 low temperature threshold is -15 degree
 current temperature is 50 degree
 Status:Normal

DORICHOR-BABU#`;

const FAN = `FAN_NUMBER\t  STATUS
               1\t running
               2\t running
DORICHOR-BABU#`;

const POWER = `POWER_NUMBER\t  STATUS
               1\t      on
DORICHOR-BABU#`;

test('system telemetry from real show outputs', () => {
    const s = t.parseBdcomSystem({ version: VERSION, temperature: TEMP, fan: FAN, power: POWER }, {});
    assert.equal(s.model, 'P3310D');
    assert.equal(s.firmware, '10.1.0F Build 103950');
    assert.equal(s.serial, '00325017791');
    assert.equal(s.deviceMac, '00:55:b1:4a:c7:7e');
    assert.equal(s.uptime, '94d 14h 33m 42s');
    assert.equal(s.temperatureC, 50);
    assert.equal(s.temperatureHighC, 75);
    assert.equal(s.temperatureStatus, 'Normal');
    assert.equal(s.fan.fans.length, 2);
    assert.equal(s.fan.fans[0].status, 'Normal');
    assert.equal(s.powerSlots[0].working, true);
    assert.equal(s.cpuUtilizationPercent, null);
    assert.equal(s.memoryUtilizationPercent, null);
});

test('healthy BDCOM produces no false alarm events', () => {
    const s = t.parseBdcomSystem({ version: VERSION, temperature: TEMP, fan: FAN, power: POWER }, {});
    assert.deepEqual(buildDerivedEvents(s, []), []);
});

test('failed fan and power are reported', () => {
    const s = t.parseBdcomSystem({
        version: VERSION, temperature: TEMP,
        fan: 'FAN_NUMBER STATUS\n 1  stopped\n 2  running', power: 'POWER_NUMBER STATUS\n 1  off'
    }, {});
    const ev = buildDerivedEvents(s, []);
    assert.equal(ev.length, 2);
});

test('CPU / memory parsers tolerate unknown or error output', () => {
    assert.equal(t.parseCpu('^\nToo many parameters\nOLT#'), null);
    assert.equal(t.parseMemory('Incomplete command\nOLT#'), null);
    assert.equal(t.parseCpu('CPU utilization for five seconds: 7%; one minute: 6%; five minutes: 5%').percent, 7);
    assert.equal(t.parseMemory('Total: 131072 Used: 65536 Free: 65536').percent, 50);
});

test('vendor detection', () => {
    assert.equal(t.isBdcom({ vendor: 'BDCOM' }), true);
    assert.equal(t.isBdcom({ vendor: 'BD-COM EPON' }), true);
    assert.equal(t.isBdcom({ vendor: 'ecom' }), false);
});

test('help parser extracts sub-commands from a "?" listing', () => {
    const words = t.parseHelpWords(
        ` usage      Display memory usage\n statistics Memory statistics\n <cr>\nOLT#show memory \nIncomplete command\nOLT#`,
        'show memory'
    );
    assert.deepEqual(words, ['usage', 'statistics']);
});

test('real "show cpu" output of a P3310D', () => {
    const c = t.parseCpu(`CPU utilization for one second: 10%; one minute: 14%; five minutes: 12%
CPU MAX utilization: 100%(1970-1-1 3:41:22)
DORICHOR-BABU#`);
    assert.deepEqual(c, { percent: 10, oneMinute: 14, fiveMinutes: 12 });
});

// Verbatim from a real P3310D (probe #2, 2026-11-27)
const PON_DDM = `interface    Temperature(degree)  Voltage(V)  Current(mA)    TxPower(dBm)
-----------  -------------------  ----------  -------------  --------------
epon0/3      56.8                 3.3         55.6           8.5           
 interface    RxPower(dBm)
-----------  --------------
epon0/3:2    -18.4          
epon0/3:3    -18.4          
         epon0/3:19   -18.7          
epon0/3:25   -18.7          
DORICHOR-BABU#`;

test('PON SFP DDM and OLT-side ONU Rx', () => {
    const d = t.parsePonDdm(PON_DDM);
    assert.equal(d.port, 3);
    assert.equal(d.temp, 56.8);
    assert.equal(d.voltage, 3.3);
    assert.equal(d.bias, 55.6);
    assert.equal(d.tx, 8.5);
    assert.equal(d.onuCount, 4);
    assert.equal(d.rx, -18.5);
    assert.equal(d.rxMin, -18.7);
    const p = t.ddmPort('0/3', d);
    assert.equal(p.status, 'ok');
    assert.equal(p.name, 'PON 3');
});

test('BDCOM ONU optical readings are averaged per PON without mixing ports', () => {
    const rows = [
        { pon_no: 1, status: 'online', temperature: 27, voltage: 3.3, bias_current: 10.8, tx_power: 2.0, rx_power: -12.3 },
        { pon_no: 1, status: 'online', temperature: 32, voltage: 3.2, bias_current: 6.8, tx_power: 2.5, rx_power: -17.7 },
        { pon_no: 1, status: 'offline', temperature: 99, voltage: 9.9, bias_current: 99, tx_power: 99, rx_power: -1 },
        { pon_no: 2, status: 'online', temperature: 30, voltage: 3.1, bias_current: 8, tx_power: 1.5, rx_power: -20 }
    ];

    const p1 = t.aggregateOnuOptical(rows, '0/1');
    assert.equal(p1.temp, 29.5);
    assert.equal(p1.voltage, 3.3);
    assert.equal(p1.bias, 8.8);
    assert.equal(p1.tx, 2.3);
    assert.equal(p1.rx, -15);
    assert.equal(p1.rxMin, -17.7);
    assert.equal(p1.rxMax, -12.3);
    assert.equal(p1.onuCount, 2);
    assert.equal(p1.onuReadCount, 2);
    assert.equal(p1.readingSource, 'online_onu_average');

    const p2 = t.aggregateOnuOptical(rows, '0/2');
    assert.equal(p2.temp, 30);
    assert.equal(p2.rx, -20);
    assert.equal(p2.onuCount, 1);
    assert.equal(t.aggregateOnuOptical(rows, '0/4'), null);
});

test('real "show memory region" utilization', () => {
    const m = t.parseMemory(`Level 1 Heap:
    max block 19926128, free 20013360 bytes,
    total alloc 10773 blocks(75665216 bytes)
No Level 2 Heap avaliable.
Memory utilization 61%(Image 21%, Region 23%, Heap 37%/71%, Msg buffer 0%/6%)
+[ 0]Size:    32 Current:10006 Max:  10337 Total: 126279
DORICHOR-BABU#`);
    assert.equal(m.percent, 61);
});
