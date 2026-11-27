'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseOnuInformation, parseActive, parseInactive, parseCtcOptical, parseMacTable
} = require('../drivers/hardware/bdcom');

// Verbatim excerpts of a real BDCOM P3310D (probe 2026-11-26). The CLI wraps at 80 columns.
const ACTIVE = `Interface EPON0/1 has bound 54 active ONUs:
IntfName         MAC Address    Status           OAM Status   Distance(m) RTT(TQ
) LastRegTime         LastDeregTime       LastDeregReason   Alivetime   
---------------- -------------- ---------------- ------------ ----------- ------
- ------------------- ------------------- ----------------- ------------
EPON0/1:1        d05f.af88.e690 auto-configured  ctc-oam-oper 961         593   
  1970-04-04 18:42:51 1970-04-04 18:28:40 power-off         0  .19:51:13
EPON0/1:2        00d3.9eb5.1800 auto-configured  ctc-oam-oper 2589        1597  
  1970-03-31 22:30:59 1970-03-31 22:26:38 power-off         4  .16:03:05
DORICHOR-BABU#`;

const INACTIVE = `Interface EPON0/1 has bound 10 inactive ONUs:
EPON0/1:39       4cf9.b11a.f3a4 lost             1970-01-09 03:33:30 1970-01-09 
20:28:18 wire-down         85 .18:06:01
EPON0/1:44       70a5.6a0a.fd80 lost             N/A                 1970-01-01 
00:00:44 unknow            94 .14:33:35
DORICHOR-BABU#`;

const INFO = `EPON0/1:1        CDTC     11AF       d05f.af88.e690 N/A                         
    static   auto-configured  N/A              
EPON0/4:44       ZTE      F401       c07e.40b3.d004 N/A                         
    static   lost             power-off        
DORICHOR-BABU#`;

test('active ONUs: distance and uptime, wrapped lines re-joined', () => {
    const r = parseActive(ACTIVE);
    assert.equal(r.length, 2);
    assert.equal(r[0].onu_mac, 'D0:5F:AF:88:E6:90');
    assert.equal(r[0].distance, 961);
    assert.equal(r[0].uptime_seconds, 19 * 3600 + 51 * 60 + 13);
    assert.equal(r[1].uptime_seconds, 4 * 86400 + 16 * 3600 + 3 * 60 + 5);
    assert.equal(r[1].oam_status, 'ctc-oam-oper');
});

test('inactive ONUs keep their deregistration reason', () => {
    const r = parseInactive(INACTIVE);
    assert.equal(r.length, 2);
    assert.equal(r[0].ont_id, 39);
    assert.equal(r[0].dereg_reason, 'wire-down');
    assert.equal(r[1].reg_state, 'lost');
});

test('onu-information: identity, vendor/model and lost reason', () => {
    const r = parseOnuInformation(INFO);
    assert.equal(r.length, 2);
    assert.equal(r[0].pon, 'epon0/1');
    assert.equal(r[0].model_id, '11AF');
    assert.equal(r[1].pon_no, 4);
    assert.equal(r[1].dereg_reason, 'power-off');
});

test('CTC optical diagnosis values', () => {
    const v = parseCtcOptical(` operating temperature(degree): 27
 supply voltage(V): 3.3
 bias current(mA): 10.8
 transmitted power(DBm): 2.0
 received power(DBm): -12.3
DORICHOR-BABU#`);
    assert.deepEqual(v, {
        temperature: 27, voltage: 3.3, bias_current: 10.8, tx_power: 2, rx_power: -12.3
    });
    assert.equal(parseCtcOptical('% Unknown command.'), null);
});

test('MAC table: only dynamic MACs on EPON ports', () => {
    const r = parseMacTable(`Vlan    Mac Address       Type       Ports
All\t0055.b14a.c77e\t  STATIC     CPU
1\ta07e.1117.024b\t  DYNAMIC    g0/1
1\te01c.fca4.e1bb\t  DYNAMIC    epon0/1:2
1\td832.1473.3837\t  DYNAMIC    epon0/4:29`);
    assert.deepEqual(r.map(x => [x.pon_no, x.ont_id]), [[1, 2], [4, 29]]);
});

test('prompt detection ignores table headers that end in ")"', () => {
    const { BdcomDriver } = require('../drivers/hardware/bdcom');
    const d = new BdcomDriver({ ip: '127.0.0.1' });
    const header = 'interface    Temperature(degree)  Voltage(V)  Current(mA)    TxPower(dBm)';
    assert.equal(d.detectPrompt(header), '');
    assert.equal(d.detectPrompt(header + '\n-----------  ----'), '');
    assert.equal(d.detectPrompt(' interface    RxPower(dBm)'), '');
    assert.equal(d.detectPrompt('x\nDORICHOR-BABU#'), 'DORICHOR-BABU#');
    assert.equal(d.detectPrompt('x\nOLT(config)#'), 'OLT(config)#');
    assert.equal(d.detectPrompt('x\nOLT>'), 'OLT>');
    assert.equal(d.detectPrompt('x\nOLT# --More--'), '');
});
