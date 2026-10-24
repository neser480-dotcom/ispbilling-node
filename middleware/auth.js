"use strict";

const requireAuth = (
req,
res,
next
) => {


if (
    !req.session ||
    !req.session.user_id
) {

    return res.status(401).json({

        success: false,

        status: false,

        message: "Not logged in."

    });
}


next();


};

module.exports = {

requireAuth

};
