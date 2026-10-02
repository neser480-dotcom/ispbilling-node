"use strict";

const path = require("path");
const activeCustomerService = require("../services/activeCustomerService");

/*
|--------------------------------------------------------------------------
| AUTH / COMPANY HELPERS
|--------------------------------------------------------------------------
*/

function getSessionUser(req) {
    const session = req.session || {};

    return {
        userId: Number(session.user_id || 0),
        companyId: Number(session.company_id || 0),
        role: String(session.role || "").trim()
    };
}

function isSuperAdmin(user) {
    return user.role === "super_admin";
}

function requireAuth(req, res) {
    const user = getSessionUser(req);

    if (!user.userId) {
        res.status(401).json({
            success: false,
            message: "Authentication required."
        });

        return null;
    }

    if (!isSuperAdmin(user) && user.companyId <= 0) {
        res.status(403).json({
            success: false,
            message: "Company access is not configured for this account."
        });

        return null;
    }

    return user;
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

exports.page = async (req, res) => {
    const user = getSessionUser(req);

    if (!user.userId) {
        return res.redirect("/login");
    }

    if (!isSuperAdmin(user) && user.companyId <= 0) {
        return res.status(403).send(
            "Company access is not configured for this account."
        );
    }

    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "monitoring",
            "active-customer.html"
        )
    );
};

/*
|--------------------------------------------------------------------------
| ROUTERS
|--------------------------------------------------------------------------
*/

exports.routers = async (req, res) => {
    const user = requireAuth(req, res);

    if (!user) return;

    try {
        const routers =
            await activeCustomerService.getRouters(user);

        return res.json({
            success: true,
            data: routers
        });
    } catch (error) {
        console.error("Active Customer routers error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to load MikroTik routers."
        });
    }
};

/*
|--------------------------------------------------------------------------
| DATA
|--------------------------------------------------------------------------
*/

exports.data = async (req, res) => {
    const user = requireAuth(req, res);

    if (!user) return;

    try {
        const routerId =
            Number(req.query.router_id || 0);

        const packageFilter =
            String(req.query.package || "").trim();

        const areaFilter =
            String(req.query.area || "").trim();

        const subAreaFilter =
            String(req.query.sub_area || "").trim();

        let connectionStatus =
            String(
                req.query.connection_status || "all"
            )
                .trim()
                .toLowerCase();

        if (
            !["all", "active", "offline"].includes(
                connectionStatus
            )
        ) {
            connectionStatus = "all";
        }

        const result =
            await activeCustomerService.getData({
                user,
                routerId,
                packageFilter,
                areaFilter,
                subAreaFilter,
                connectionStatus
            });

        return res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Active Customer data error:", error);

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load Active Customer data."
        });
    }
};