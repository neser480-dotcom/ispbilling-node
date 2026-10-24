"use strict";

const fileUpload = require("express-fileupload");

function multipart() {
    return fileUpload({
        createParentPath: false,

        limits: {
            fileSize: 50 * 1024 * 1024
        },

        abortOnLimit: true,

        useTempFiles: false,

        parseNested: false,

        debug: false
    });
}

module.exports = {
    multipart
};