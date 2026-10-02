"use strict";

const path = require("path");

const {
    getInterfaceMonitor,
    getBandwidth
} = require("../services/interfaceMonitorService");

function isAuthenticated(req) {
    return !!(req.session && req.session.user_id);
}

async function index(req, res) {
    if (!isAuthenticated(req)) {
        return res.redirect("/");
    }

    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "monitoring",
            "interface.html"
        )
    );
}

async function data(req, res) {
    if (!isAuthenticated(req)) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized."
        });
    }

    try {
        const companyId = Number(req.session.company_id || 0);
        const role = String(req.session.role || "");
        const routerId = Number(req.query.id || 0);

        const result = await getInterfaceMonitor({
            companyId,
            role,
            routerId
        });

        return res.json(result);

    } catch (error) {
        console.error("Interface Monitor API Error:", error);

        return res.status(500).json({
            success: false,
            message: "Interface Monitor loading failed.",
            error:
                process.env.NODE_ENV === "production"
                    ? undefined
                    : error.message
        });
    }
}

async function bandwidth(req, res) {
    if (!isAuthenticated(req)) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized."
        });
    }

    try {
        const companyId = Number(req.session.company_id || 0);
        const role = String(req.session.role || "");
        const routerId = Number(req.query.id || 0);
        const interfaceName = String(
            req.query.interface || ""
        ).trim();

        if (!routerId || !interfaceName) {
            return res.status(400).json({
                success: false,
                message: "Router ID and interface are required."
            });
        }

        const result = await getBandwidth({
            companyId,
            role,
            routerId,
            interfaceName
        });

        return res.json(result);

    } catch (error) {
        console.error("Interface Bandwidth API Error:", error);

        return res.status(500).json({
            success: false,
            message: "Bandwidth loading failed.",
            error:
                process.env.NODE_ENV === "production"
                    ? undefined
                    : error.message
        });
    }
}

module.exports = {
    index,
    data,
    bandwidth
};