const express = require("express");

const router = express.Router();

const { requireAuth } = require("../middleware/auth");


/*
|--------------------------------------------------------------------------
| GET SIDEBAR DATA
|--------------------------------------------------------------------------
| Same purpose as PHP sidebar session data.
|--------------------------------------------------------------------------
*/

router.get("/data", requireAuth, async (req, res) => {

    try {

        const userId =
            req.session.user_id || null;

        const companyId =
            req.session.company_id || null;

        const role =
            req.session.role || "staff";

        const fullname =
            req.session.fullname || "";

        const customerId =
            req.session.customer_id || null;


        return res.json({

            success: true,

            user: {

                user_id: userId,

                customer_id: customerId,

                company_id: companyId,

                fullname: fullname,

                role: role

            }

        });

    } catch (error) {

        console.error(
            "Sidebar API Error:",
            error
        );

        return res.status(500).json({

            success: false,

            message: "Unable to load sidebar."

        });

    }

});


module.exports = router;