'use strict';

/*
|--------------------------------------------------------------------------
| ECOM E08EP-4S+ learned-MAC collection
|--------------------------------------------------------------------------
| VERIFIED on the real OLT (probe output of 2026-10-27, OLT "Ecom 8s"):
|
|   show mac-address port pon <F/S/P> with-ont-location      (config mode)
|
|    MAC                 VLAN   Port          ONT-Id  MAC-Type
|    E8:65:D4:7E:55:48   301    epon0/1/1     14      dynamic
|
| F/S/P is "<f_s>/<pon>" from "show ont info all" (f_s "0/1" + P 1 = 0/1/1).
| One command per PON returns every learned MAC with its ONT-Id; an ONT can
| show several MACs. NOT supported on this model (verified): "show mac-address
| ont ...", and "show mac-address dynamic/all/location" carry no ONT-Id.
|
| Override with ECOM_LEARNED_MAC_CONFIG (JSON, same shape as the C-Data one)
| or disable with ECOM_LEARNED_MAC_CONFIG=off.
|--------------------------------------------------------------------------
*/

const { loadConfig, collectLearnedMacs } = require('./cdata-learned-mac');

const ECOM_DEFAULT_CONFIG = {
    commands: [{
        command: 'show mac-address port pon {iface}/{pon} with-ont-location',
        perPort: true,
        lineRegex:
            '^(?<mac>[0-9a-f]{2}(?::[0-9a-f]{2}){5})\\s+\\d+\\s+epon\\d+/\\d+/(?<pon>\\d+)\\s+(?<ont>\\d+)\\s+dynamic$'
    }]
};

function loadEcomConfig(raw = process.env.ECOM_LEARNED_MAC_CONFIG) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        raw = ECOM_DEFAULT_CONFIG;
    }

    return loadConfig(raw);
}

async function collectEcomLearnedMacs(driver, onuRows, config = loadEcomConfig()) {
    return collectLearnedMacs(driver, onuRows, config);
}

module.exports = { ECOM_DEFAULT_CONFIG, loadEcomConfig, collectEcomLearnedMacs };
