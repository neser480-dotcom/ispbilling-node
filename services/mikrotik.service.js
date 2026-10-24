"use strict";

let RouterOSAPI = null;

try {
    RouterOSAPI =
        require("node-routeros").RouterOSAPI;
} catch (_) {
    RouterOSAPI = null;
}


const db =
    require("../config/database");


/*
|--------------------------------------------------------------------------
| DATABASE ROUTER
|--------------------------------------------------------------------------
*/

async function router(id) {
    const [rows] =
        await db.query(
            `
            SELECT *
            FROM mikrotik_servers

            WHERE id = ?

              AND deleted_at IS NULL

            LIMIT 1
            `,
            [id]
        );

    if (!rows.length) {
        throw new Error(
            "MikroTik router not found."
        );
    }

    return rows[0];
}


/*
|--------------------------------------------------------------------------
| CONNECT
|--------------------------------------------------------------------------
*/

async function connect(r) {
    if (!RouterOSAPI) {
        throw new Error(
            "node-routeros is not installed."
        );
    }

    const api =
        new RouterOSAPI({
            host: r.ip,
            user: r.username,
            password: r.password,
            port: Number(
                r.port || 8728
            ),
            timeout: Number(
                r.timeout || 3
            ),
            tls: !!Number(
                r.use_ssl || 0
            )
        });

    await api.connect();

    return api;
}


/*
|--------------------------------------------------------------------------
| CLOSE
|--------------------------------------------------------------------------
*/

async function close(api) {
    if (!api) {
        return;
    }

    try {
        await api.close();
    } catch (_) {}
}


/*
|--------------------------------------------------------------------------
| ROUTER STATUS
|--------------------------------------------------------------------------
*/

async function status(r) {
    const api =
        await connect(r);

    try {
        const identityRows =
            await api.write(
                "/system/identity/print"
            );

        const identity =
            identityRows?.length
                ? identityRows[0]
                : {};

        const resourceRows =
            await api.write(
                "/system/resource/print"
            );

        const resource =
            resourceRows?.length
                ? resourceRows[0]
                : {};

        const secretRows =
            await api.write(
                "/ppp/secret/print"
            );

        const secrets =
            Array.isArray(secretRows)
                ? secretRows
                : [];

        const activeRows =
            await api.write(
                "/ppp/active/print"
            );

        const active =
            Array.isArray(activeRows)
                ? activeRows
                : [];

        const profileRows =
            await api.write(
                "/ppp/profile/print"
            );

        const profiles =
            Array.isArray(profileRows)
                ? profileRows
                : [];

        return {
            identity:
                identity.name || "",

            resource,

            pppoe_total:
                secrets.length,

            active_total:
                active.length,

            profile_total:
                profiles.length
        };

    } finally {
        await close(api);
    }
}


/*
|--------------------------------------------------------------------------
| PPP PROFILES
|--------------------------------------------------------------------------
*/

async function profiles(r) {
    const api =
        await connect(r);

    try {
        const rows =
            await api.write(
                "/ppp/profile/print"
            );

        return Array.isArray(rows)
            ? rows
            : [];

    } finally {
        await close(api);
    }
}


/*
|--------------------------------------------------------------------------
| ACTIVE PPP
|--------------------------------------------------------------------------
*/

async function active(r) {
    const api =
        await connect(r);

    try {
        const rows =
            await api.write(
                "/ppp/active/print"
            );

        return Array.isArray(rows)
            ? rows
            : [];

    } finally {
        await close(api);
    }
}


/*
|--------------------------------------------------------------------------
| FIND PPP SECRET
|--------------------------------------------------------------------------
*/

async function findSecret(
    api,
    username
) {
    const name =
        String(
            username || ""
        ).trim();

    if (!name) {
        throw new Error(
            "PPPoE username is required."
        );
    }

    const rows =
        await api.write(
            "/ppp/secret/print",
            [
                "?name=" + name
            ]
        );

    if (
        !Array.isArray(rows) ||
        !rows.length
    ) {
        throw new Error(
            "PPPoE secret not found on MikroTik: " +
            name
        );
    }

    return rows[0];
}


/*
|--------------------------------------------------------------------------
| RESOLVE PPP PROFILE NAME
|--------------------------------------------------------------------------
|
| mikrotik_packages.profile_id stores
| RouterOS profile .id such as:
|
|     *C
|     *9
|
| PPP secret profile expects the
| actual profile NAME.
|--------------------------------------------------------------------------
*/

async function resolveProfileName(
    api,
    profileIdOrName
) {
    const requested =
        String(
            profileIdOrName || ""
        ).trim();

    if (!requested) {
        throw new Error(
            "MikroTik PPP profile is required."
        );
    }

    const rows =
        await api.write(
            "/ppp/profile/print"
        );

    if (!Array.isArray(rows)) {
        throw new Error(
            "Unable to read MikroTik PPP profiles."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Exact .id match
    |--------------------------------------------------------------------------
    */

    const byId =
        rows.find(
            profile =>
                String(
                    profile[".id"] || ""
                ).trim() ===
                requested
        );

    if (byId) {
        const name =
            String(
                byId.name || ""
            ).trim();

        if (!name) {
            throw new Error(
                "MikroTik profile name is empty for profile ID: " +
                requested
            );
        }

        return name;
    }

    /*
    |--------------------------------------------------------------------------
    | Name already supplied
    |--------------------------------------------------------------------------
    */

    const byName =
        rows.find(
            profile =>
                String(
                    profile.name || ""
                ).trim() ===
                requested
        );

    if (byName) {
        return String(
            byName.name
        ).trim();
    }

    throw new Error(
        "MikroTik PPP profile not found: " +
        requested
    );
}


/*
|--------------------------------------------------------------------------
| SET CUSTOMER CONNECTION
|--------------------------------------------------------------------------
*/

async function setCustomerConnection(
    customer,
    on
) {
    const r =
        await router(
            customer.mikrotik_id
        );

    const api =
        await connect(r);

    try {
        const secret =
            await findSecret(
                api,
                customer.pppoe_username
            );

        const secretId =
            secret[".id"];

        if (!secretId) {
            throw new Error(
                "MikroTik PPP secret ID was not found."
            );
        }

        await api.write(
            "/ppp/secret/set",
            [
                "=.id=" +
                    secretId,

                "=disabled=" +
                    (
                        on
                            ? "no"
                            : "yes"
                    )
            ]
        );

        return true;

    } finally {
        await close(api);
    }
}


/*
|--------------------------------------------------------------------------
| SYNC CUSTOMER
|--------------------------------------------------------------------------
*/

async function syncCustomer(
    customer,
    body = {}
) {
    const r =
        await router(
            customer.mikrotik_id
        );

    const api =
        await connect(r);

    try {
        const username =
            String(
                body.pppoe_username ||
                customer.pppoe_username ||
                ""
            ).trim();

        const secret =
            await findSecret(
                api,
                username
            );

        const secretId =
            secret[".id"];

        if (!secretId) {
            throw new Error(
                "MikroTik PPP secret ID was not found."
            );
        }

        const commands = [
            "=.id=" +
                secretId
        ];

        /*
        |--------------------------------------------------------------------------
        | PASSWORD
        |--------------------------------------------------------------------------
        */

        if (
            body.pppoe_password !== undefined &&
            body.pppoe_password !== null &&
            String(
                body.pppoe_password
            ) !== ""
        ) {
            commands.push(
                "=password=" +
                String(
                    body.pppoe_password
                )
            );
        }

        /*
        |--------------------------------------------------------------------------
        | COMMENT
        |--------------------------------------------------------------------------
        */

        if (
            body.comment !== undefined &&
            body.comment !== null
        ) {
            commands.push(
                "=comment=" +
                String(
                    body.comment
                )
            );
        }

        /*
        |--------------------------------------------------------------------------
        | PROFILE
        |--------------------------------------------------------------------------
        */

        if (
            body.profile_id !== undefined &&
            body.profile_id !== null &&
            String(
                body.profile_id
            ).trim()
        ) {
            const profileName =
                await resolveProfileName(
                    api,
                    body.profile_id
                );

            commands.push(
                "=profile=" +
                profileName
            );
        }

        await api.write(
            "/ppp/secret/set",
            commands
        );

        return true;

    } finally {
        await close(api);
    }
}


/*
|--------------------------------------------------------------------------
| DELETE PPP SECRET
|--------------------------------------------------------------------------
*/

async function deleteCustomer(
    customer
) {
    const r =
        await router(
            customer.mikrotik_id
        );

    const api =
        await connect(r);

    try {
        const secret =
            await findSecret(
                api,
                customer.pppoe_username
            );

        const secretId =
            secret[".id"];

        if (!secretId) {
            throw new Error(
                "MikroTik PPP secret ID was not found."
            );
        }

        await api.write(
            "/ppp/secret/remove",
            [
                "=.id=" +
                    secretId
            ]
        );

        return true;

    } finally {
        await close(api);
    }
}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
    router,
    connect,
    status,
    profiles,
    active,
    setCustomerConnection,
    syncCustomer,
    deleteCustomer
};
