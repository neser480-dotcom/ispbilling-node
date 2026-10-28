
"use strict";

/**
 * File: config/olt-models.js
 *
 * নতুন মডেল একই command protocol ব্যবহার করলে এখানে
 * model configuration যোগ করলেই হবে।
 */

const OLT_MODELS = [
    {
        id: "ecom-e08ep-4s",
        vendor: "ecom",
        model: "E08EP-4S+",
        aliases: ["ecom 8s", "e08ep", "ecom-e08ep-4s"],
        ponCount: 8,
        port: 23,
        driver: "ecom",
        commandProfile: "ecom-e08ep",
      ponIdFormat: "0/{bank}/{port}",
        banks: [1, 2],
        portsPerBank: 4,
        systemTelemetry: true,
        enabled: true
    },

{
    id: "ecom-4port",
    vendor: "ecom",
    model: "E1204ES-4C-2S+",
    aliases: ["ecom 4 port", "ecom 4-port"],
    ponCount: 4,
    port: 23,
    driver: "ecom",
    commandProfile: "ecom-e08ep",
    ponIdFormat: "0/{bank}/{port}",
    banks: [1],
    portsPerBank: 4,
    systemTelemetry: true,
    enabled: true
},

    /*
     * নতুন ECOM মডেল যোগ করার নমুনা:
     *
     * {
     *     id: "ecom-new-model",
     *     vendor: "ecom",
     *     model: "NEW-MODEL",
     *     aliases: ["new model alias"],
     *     ponCount: 4,
     *     port: 23,
     *     driver: "ecom",
     *     commandProfile: "ecom-e08ep",
     *     ponIdFormat: "0/{bank}/1",
     *     banks: [1],
     *     portsPerBank: 4,
     *     systemTelemetry: true,
     *     enabled: true
     * }
     */
];

function normalize(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-");
}

function getOltModel(olt) {
    const vendor = normalize(olt?.vendor);
    const model = normalize(olt?.model || olt?.name);

    return OLT_MODELS.find(item => {
        if (!item.enabled) return false;

        const aliases = [
            item.id,
            item.model,
            ...item.aliases
        ].map(normalize);

        return (
            normalize(item.vendor) === vendor &&
            aliases.some(alias =>
                model === alias ||
                model.includes(alias) ||
                alias.includes(model)
            )
        );
    }) || null;
}

function buildPonIds(config) {
    if (!config || !config.enabled) return [];

    const ids = [];

    for (const bank of config.banks || []) {
        for (
            let port = 1;
            port <= (config.portsPerBank || 4);
            port++
        ) {
            ids.push(
                config.ponIdFormat
                    .replace("{bank}", String(bank))
                    .replace("{port}", String(port))
            );
        }
    }

    return ids.slice(0, config.ponCount);
}

module.exports = {
    OLT_MODELS,
    getOltModel,
    buildPonIds
};
