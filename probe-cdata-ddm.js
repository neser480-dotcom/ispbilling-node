"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(
    __dirname,
    "services",
    "olt-monitor.service.js"
);

const source = fs.readFileSync(file, "utf8");

console.log("Service file:", file);
console.log("File exists:", fs.existsSync(file));
console.log(
    "Parser defined:",
    /function\s+parseCDataDdm\s*\(/.test(source)
);
console.log(
    "C-Data driver imported:",
    /require\(["']\.\.\/drivers\/cdata["']\)/.test(source)
);
console.log(
    "Shadowing bug pattern found:",
    /const\s+ports\s*=\s*parseCDataDdm\s*\(/.test(source)
);
console.log(
    "Outer ports assignment found:",
    /ports\s*=\s*parseCDataDdm\s*\(/.test(source)
);

try {
    const driverPath = path.join(
        __dirname,
        "drivers",
        "cdata.js"
    );

    const driver = fs.readFileSync(driverPath, "utf8");

    console.log("\nDriver file:", driverPath);
    console.log(
        "command() method found:",
        /(?:async\s+)?command\s*\(/.test(driver)
    );
    console.log(
        "show ddm-info all referenced:",
        /show\s+ddm-info\s+all/i.test(driver)
    );
} catch (error) {
    console.log("Driver read error:", error.message);
}