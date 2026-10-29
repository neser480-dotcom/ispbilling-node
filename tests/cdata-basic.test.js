'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CDataDriver } = require('../drivers/cdata');

// Verbatim excerpt of the real OLT output (probe 2026-10-29, PON 2).
const BASIC = `-----------------------------------------------------------------------------
  F/S  P  ONT MAC               Type  Distance  Up          Extended
          ID                          (m)       Time        Model
 ----------------------------------------------------------------------------
  0/0  2  12  D0:5F:AF:08:F0:03 SFU   803       0:03:17:48  110R
  0/0  2  13  48:AD:08:4F:24:85 --
  0/0  2  20  54:93:59:23:A3:A2 SFU   585       0:03:18:23  ONU1FE
  0/0  2  43  00:D3:9E:EF:FB:D4 --
  0/0  2  44  A0:7F:04:14:19:0C HGU   921       0:03:18:03  EPON
-----------------------------------------------------------------------------
  Total: 62, online 56

Modokande OLT(config-interface-epon-0/0)#`;

const rows = () => new CDataDriver({}).parseRows(BASIC, 2, 'basic');
const by = id => rows().find(r => r.ont_id === id);

test('an ONT listed with "--" is offline and has no distance', () => {
    assert.equal(by(13).status, 'Offline');
    assert.equal(by(13).run_state, 'offline');
    assert.equal(by(13).distance, null);
    assert.equal(by(43).status, 'Offline');
});

test('registered ONTs stay online with their distance', () => {
    assert.equal(by(20).status, 'Online');
    assert.equal(by(20).distance, '585');
    assert.equal(by(44).distance, '921');
    assert.equal(by(12).distance, '803');
});

test('header, footer and prompt lines are ignored', () => {
    assert.equal(rows().length, 5);
});
