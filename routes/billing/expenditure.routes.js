
"use strict";

const express = require("express");
const path = require("path");
const controller = require("../../controllers/billing/expenditure.controller");

const router = express.Router();

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user_id) {
        if (
            req.path.startsWith("/api/") ||
            req.originalUrl.startsWith("/api/")
        ) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        return res.redirect("/");
    }

    next();
}

router.use(requireLogin);

// Expenditure page
router.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "..", "views", "billing", "expenditure.html")
    );
});

// Expenditure API
router.get("/api/data", controller.getPageData);

router.post(
    "/api/expenditures",
    controller.addExpenditure
);

router.put(
    "/api/expenditures/:id",
    controller.updateExpenditure
);

router.delete(
    "/api/expenditures/:id",
    controller.deleteExpenditure
);

// Expenditure type API
router.post("/api/types", controller.addType);

router.put(
    "/api/types/:id",
    controller.updateType
);

router.delete(
    "/api/types/:id",
    controller.deleteType
);

module.exports = router;
