
'use strict';

const fs = require('fs');
const path = require('path');

const root = 'C:\\xampp\\htdocs\\ispbilling-node';

const files = {
    route: path.join(root, 'routes/mikrotik/router.js'),
    controller: path.join(
        root,
        'controllers/mikrotik/router.controller.js'
    ),
    frontend: path.join(
        root,
        'public/assets/js/mikrotik.js'
    )
};

function replaceExactOnce(content, oldText, newText, label) {
    const escaped = oldText
        .split('\n')
        .map(line =>
            line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('\\r?\\n');

    const pattern = new RegExp(escaped, 'g');
    const matches = [...content.matchAll(pattern)];

    if (matches.length !== 1) {
        throw new Error(
            `${label}: expected exactly one match, found ${matches.length}. No files changed.`
        );
    }

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const replacement = newText.replace(/\r?\n/g, eol);

    return content.replace(pattern, () => replacement);
}

// Read original files
const original = {
    route: fs.readFileSync(files.route, 'utf8'),
    controller: fs.readFileSync(files.controller, 'utf8'),
    frontend: fs.readFileSync(files.frontend, 'utf8')
};

// Work on memory copies only
let route = original.route;
let controller = original.controller;
let frontend = original.frontend;

// --------------------------------------------------
// 1. Add selected customer sync route
// --------------------------------------------------

route = replaceExactOnce(
    route,
    `router.post(
    "/:id/customers/sync",
    controller.customerSync
);`,
    `router.post(
    "/:id/customers/sync",
    controller.customerSync
);

router.post(
    "/:id/customers/sync-selected",
    controller.customerSync
);`,
    'Customer sync route'
);

// --------------------------------------------------
// 2. Add selected username filter
// --------------------------------------------------

controller = replaceExactOnce(
    controller,
    `        /*
        |--------------------------------------------------------------------------
        | READ CUSTOMERS TABLE
        |--------------------------------------------------------------------------
        */`,
    `        /*
        |--------------------------------------------------------------------------
        | SELECTED CUSTOMER FILTER
        |--------------------------------------------------------------------------
        */

        const requestedUsernames =
            Array.isArray(req.body?.usernames)
                ? [...new Set(
                    req.body.usernames
                        .map(username => String(username || "").trim())
                        .filter(Boolean)
                )]
                : null;

        if (
            req.path.endsWith("/sync-selected") &&
            (!requestedUsernames || !requestedUsernames.length)
        ) {
            return res.status(400).json({
                status: false,
                success: false,
                message: "Select at least one PPPoE customer."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | READ CUSTOMERS TABLE
        |--------------------------------------------------------------------------
        */`,
    'Selected customer filter'
);

// --------------------------------------------------
// 3. Filter selected secrets and update total
// --------------------------------------------------

controller = replaceExactOnce(
    controller,
    `        const total =
            secrets.length;`,
    `        const syncSecrets =
            requestedUsernames
                ? secrets.filter(secret =>
                    requestedUsernames.includes(
                        String(secret?.name || "").trim()
                    )
                )
                : secrets;

        const total =
            syncSecrets.length;`,
    'Selected customer total'
);

// --------------------------------------------------
// 4. Process selected secrets only
// --------------------------------------------------

controller = replaceExactOnce(
    controller,
    `        for (
            const secret of secrets
        ) {`,
    `        for (
            const secret of syncSecrets
        ) {`,
    'PPP secret processing loop'
);

// --------------------------------------------------
// 5. Send selected usernames from frontend
// --------------------------------------------------

frontend = replaceExactOnce(
    frontend,
    `body: JSON.stringify({
                                        usernames: choice.usernames
                                    })`,
    `body: JSON.stringify({
                                        usernames: choice.usernames,
                                        include_inactive: step1.includeInactive
                                    })`,
    'Frontend selected customer request'
);

// --------------------------------------------------
// Verify all expected changes before writing
// --------------------------------------------------

if (
    route === original.route ||
    controller === original.controller ||
    frontend === original.frontend
) {
    throw new Error(
        'One or more files were not changed. No files written.'
    );
}

// --------------------------------------------------
// Write all three files
// --------------------------------------------------

fs.writeFileSync(files.route, route, 'utf8');
fs.writeFileSync(files.controller, controller, 'utf8');
fs.writeFileSync(files.frontend, frontend, 'utf8');

console.log('');
console.log('MikroTik Customer Sync fix applied successfully.');
console.log('Updated files:');
console.log('1. routes/mikrotik/router.js');
console.log('2. controllers/mikrotik/router.controller.js');
console.log('3. public/assets/js/mikrotik.js');
console.log('');
