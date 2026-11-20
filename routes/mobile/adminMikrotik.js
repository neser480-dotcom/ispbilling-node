"use strict";

const express = require("express");
const { invokeRouter } = require("../../services/mobile/webBridge");
const mikrotikRouter = require("../mikrotik/router");

const router = express.Router();

function proxy(method, url) {
    return async (req, res, next) => {
        try {
            const result = await invokeRouter(mikrotikRouter, req, {
                method,
                url: typeof url === "function" ? url(req) : url,
                query: req.query || {},
                body: req.body || {}
            });
            return res.status(result.status || 500).json(
                result.body || { success: false, message: "MikroTik request failed." }
            );
        } catch (error) {
            return next(error);
        }
    };
}

router.get("/", proxy("GET", "/"));
router.post("/", proxy("POST", "/"));
router.put("/:id", proxy("PUT", req => `/${req.params.id}`));
router.delete("/:id", proxy("DELETE", req => `/${req.params.id}`));

router.get("/:id/check", proxy("GET", req => `/${req.params.id}/check`));
router.get("/:id/history", proxy("GET", req => `/${req.params.id}/history`));

router.get("/:id/packages", proxy("GET", req => `/${req.params.id}/packages`));
router.post("/:id/packages/sync", proxy("POST", req => `/${req.params.id}/packages/sync`));
router.put("/packages/:id", proxy("PUT", req => `/packages/${req.params.id}`));
router.delete("/packages/:id", proxy("DELETE", req => `/packages/${req.params.id}`));

router.post("/:id/customers/sync", proxy("POST", req => `/${req.params.id}/customers/sync`));
router.get("/:id/customers", proxy("GET", req => `/${req.params.id}/customers`));

module.exports = router;
