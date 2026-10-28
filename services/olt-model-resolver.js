
"use strict";

const {
    OLT_MODELS,
    getOltModel,
    buildPonIds
} = require("../config/olt-models");

function resolveOlt(olt) {
    if (!olt || typeof olt !== "object") {
        throw new Error("OLT configuration is required");
    }

    const config = getOltModel(olt);

    if (!config) {
        throw new Error(
            `Unsupported OLT model: ${olt.model || olt.name || "unknown"}`
        );
    }

    return {
        config,
        ponIds: buildPonIds(config),
        driver: config.driver,
        commandProfile: config.commandProfile,
        systemTelemetry: config.systemTelemetry
    };
}

module.exports = {
    resolveOlt,
    getOltModel,
    buildPonIds,
    OLT_MODELS
};
