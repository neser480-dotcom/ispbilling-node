"use strict";

const {
    syncOnus,
    driverFor,
    disconnectDriver
} = require("../../../services/olt-sync.service");
const { parseOnuRows, buildMacScope } = require("./parser");

/*
| zte-epon vendor module.
|
| syncOnuHardware : OLT Users page. Reading the OLT and saving to the onu
|                   table is done by the existing olt-sync.service.
| readOltMacScope : OLT List page. Reads this OLT only and returns the MACs
|                   that live on it (ONU MACs + learned customer MACs), so
|                   customer sync never claims customers of other OLTs.
*/
async function syncOnuHardware(pool, olt) {
    return syncOnus(pool, olt);
}

async function readOltMacScope(olt) {
    const driver = driverFor(olt);

    try {
        await driver.connect();

        if (typeof driver.detectModel === "function") {
            await driver.detectModel();
        }

        const rows = await driver.getONUList();

        let learned = { supported: false, entries: [], errors: [] };

        if (
            Array.isArray(rows) &&
            rows.length &&
            typeof driver.getLearnedMacs === "function"
        ) {
            try {
                learned = await driver.getLearnedMacs(rows);
            } catch (error) {
                learned = {
                    supported: false,
                    entries: [],
                    errors: [error.message]
                };
            }
        }

        return buildMacScope(rows, learned);
    } finally {
        await disconnectDriver(driver);
    }
}

module.exports = {
    vendor: "zte-epon",
    syncOnuHardware,
    readOltMacScope,
    parseOnuRows
};
