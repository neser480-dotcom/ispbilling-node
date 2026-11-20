"use strict";
/* routes/mobile/index.js — mount: app.use("/api/mobile", require("./routes/mobile")) */
const express = require("express");
const router = express.Router();

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use("/auth", require("./auth"));
router.use("/customer", require("./customer"));
router.use("/admin", require("./admin"));               // Billing-গেট এখানেই প্রযোজ্য (সব /admin/* এর আগে)
router.use("/admin", require("./adminStaffReports"));

module.exports = router;
