"use strict";

const {
    RouterOSAPI
} = require("node-routeros");


/*
|--------------------------------------------------------------------------
| FIRST ITEM
|--------------------------------------------------------------------------
*/

function first(value) {

    if (Array.isArray(value)) {
        return value[0] || {};
    }

    return value || {};
}


/*
|--------------------------------------------------------------------------
| ROUTER CONNECTION
|--------------------------------------------------------------------------
*/

async function withRouter(
    router,
    callback
) {

    const api =
        new RouterOSAPI({

            host: router.ip,

            user: router.username,

            password: router.password,

            port: Number(
                router.port || 8728
            ),

            timeout:
                Number(
                    router.timeout || 5
                ) * 1000,

            tls:
                Boolean(
                    Number(
                        router.use_ssl || 0
                    )
                )

        });


    await api.connect();


    try {

        return await callback(api);

    } finally {

        try {
            api.close();
        } catch (_) {}
    }
}


/*
|--------------------------------------------------------------------------
| ROUTER STATUS
|--------------------------------------------------------------------------
*/

async function status(router) {

    return withRouter(
        router,
        async api => {

            const [
                identity,
                resource,
                secrets,
                active,
                profiles
            ] =
                await Promise.all([

                    api.write(
                        "/system/identity/print"
                    ),

                    api.write(
                        "/system/resource/print"
                    ),

                    api.write(
                        "/ppp/secret/print"
                    ),

                    api.write(
                        "/ppp/active/print"
                    ),

                    api.write(
                        "/ppp/profile/print"
                    )

                ]);


            return {

                identity:
                    first(identity).name || "",

                resource:
                    first(resource),

                pppoe_total:
                    Array.isArray(secrets)
                        ? secrets.length
                        : 0,

                active_total:
                    Array.isArray(active)
                        ? active.length
                        : 0,

                profile_total:
                    Array.isArray(profiles)
                        ? profiles.length
                        : 0

            };

        }
    );
}


/*
|--------------------------------------------------------------------------
| PPP PROFILES
|--------------------------------------------------------------------------
*/

async function profiles(router) {

    return withRouter(
        router,
        api =>
            api.write(
                "/ppp/profile/print"
            )
    );
}


/*
|--------------------------------------------------------------------------
| PPP SECRETS
|--------------------------------------------------------------------------
*/

async function secrets(router) {

    return withRouter(
        router,
        api =>
            api.write(
                "/ppp/secret/print"
            )
    );
}


/*
|--------------------------------------------------------------------------
| PPP ACTIVE
|--------------------------------------------------------------------------
*/

async function active(router) {

    return withRouter(
        router,
        api =>
            api.write(
                "/ppp/active/print"
            )
    );
}


/*
|--------------------------------------------------------------------------
| FIND PPP SECRET
|--------------------------------------------------------------------------
*/

async function findSecret(
    router,
    username
) {

    if (!username) {

        throw new Error(
            "PPPoE username is required."
        );

    }


    return withRouter(
        router,
        async api => {

            const result =
                await api.write(
                    "/ppp/secret/print",
                    [
                        `?name=${username}`
                    ]
                );


            return first(result);

        }
    );

}


/*
|--------------------------------------------------------------------------
| CREATE PPP SECRET
|--------------------------------------------------------------------------
*/

async function createSecret(
    router,
    {
        username,
        password,
        profile,
        service = "pppoe",
        comment = ""
    }
) {

    if (!username) {

        throw new Error(
            "PPPoE username is required."
        );

    }


    if (!password) {

        throw new Error(
            "PPPoE password is required."
        );

    }


    return withRouter(
        router,
        async api => {

            /*
            |------------------------------------------------------------------
            | CHECK EXISTING USER
            |------------------------------------------------------------------
            */

            const existing =
                await api.write(
                    "/ppp/secret/print",
                    [
                        `?name=${username}`
                    ]
                );


            if (
                Array.isArray(existing) &&
                existing.length > 0
            ) {

                throw new Error(
                    `PPPoE username "${username}" already exists on MikroTik.`
                );

            }


            /*
            |------------------------------------------------------------------
            | CREATE PPP SECRET
            |------------------------------------------------------------------
            */

            const command = [

                "/ppp/secret/add",

                `=name=${username}`,

                `=password=${password}`,

                `=service=${service}`

            ];


            if (profile) {

                command.push(
                    `=profile=${profile}`
                );

            }


            if (comment) {

                command.push(
                    `=comment=${comment}`
                );

            }


            const result =
                await api.write(
                    command
                );


            /*
            |------------------------------------------------------------------
            | RETURN CREATION RESULT
            |------------------------------------------------------------------
            |
            | RouterOS normally returns the newly-created
            | item ID in the "ret" field.
            |
            */

            const created =
                first(result);

            return {
                result,
                id:
                    created.ret ||
                    created[".id"] ||
                    null,
                username
            };

        }
    );

}


/*
|--------------------------------------------------------------------------
| DELETE PPP SECRET
|--------------------------------------------------------------------------
|
| Deletes only the requested PPP secret.
|
| Prefer passing the exact RouterOS ".id" / "ret" returned
| by createSecret().
|
| If an ID is not available, username can be used as fallback.
|--------------------------------------------------------------------------
*/

async function deleteSecret(
    router,
    {
        id = "",
        username = ""
    } = {}
) {

    if (!id && !username) {

        throw new Error(
            "MikroTik PPP secret ID or username is required for deletion."
        );

    }


    return withRouter(
        router,
        async api => {

            let secretId =
                String(id || "").trim();


            /*
            |------------------------------------------------------------------
            | FIND BY USERNAME WHEN ID IS NOT AVAILABLE
            |------------------------------------------------------------------
            */

            if (!secretId && username) {

                const result =
                    await api.write(
                        "/ppp/secret/print",
                        [
                            `?name=${username}`
                        ]
                    );


                const secret =
                    first(result);


                if (
                    !secret ||
                    !secret[".id"]
                ) {

                    /*
                    |----------------------------------------------------------
                    | Already absent = nothing to delete
                    |----------------------------------------------------------
                    */

                    return {
                        success: true,
                        deleted: false,
                        alreadyAbsent: true,
                        username
                    };

                }


                secretId =
                    secret[".id"];

            }


            /*
            |------------------------------------------------------------------
            | DELETE EXACT SECRET
            |------------------------------------------------------------------
            */

            if (!secretId) {

                throw new Error(
                    `Unable to determine MikroTik PPP secret ID for "${username}".`
                );

            }


            const result =
                await api.write(
                    "/ppp/secret/remove",
                    [
                        `=.id=${secretId}`
                    ]
                );


            return {
                success: true,
                deleted: true,
                id: secretId,
                username,
                result
            };

        }
    );

}


/*
|--------------------------------------------------------------------------
| UPDATE PPP SECRET
|--------------------------------------------------------------------------
*/

async function updateSecret(
    router,
    {
        username,
        oldUsername = "",
        password = "",
        profile = "",
        service = "pppoe",
        comment = ""
    }
) {

    if (!username) {

        throw new Error(
            "PPPoE username is required."
        );

    }


    return withRouter(
        router,
        async api => {

            /*
            |------------------------------------------------------------------
            | FIND EXISTING SECRET
            |------------------------------------------------------------------
            */

            const searchName =
                oldUsername ||
                username;


            const result =
                await api.write(
                    "/ppp/secret/print",
                    [
                        `?name=${searchName}`
                    ]
                );


            const secret =
                first(result);


            if (
                !secret ||
                !secret[".id"]
            ) {

                throw new Error(
                    `PPPoE username "${searchName}" was not found on MikroTik.`
                );

            }


            /*
            |------------------------------------------------------------------
            | UPDATE
            |------------------------------------------------------------------
            */

            const command = [

                "/ppp/secret/set",

                `=.id=${secret[".id"]}`

            ];


            if (username) {

                command.push(
                    `=name=${username}`
                );

            }


            if (password) {

                command.push(
                    `=password=${password}`
                );

            }


            if (profile) {

                command.push(
                    `=profile=${profile}`
                );

            }


            if (service) {

                command.push(
                    `=service=${service}`
                );

            }


            if (comment !== undefined) {

                command.push(
                    `=comment=${comment}`
                );

            }


            return api.write(
                command
            );

        }
    );

}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {

    withRouter,

    status,

    profiles,

    secrets,

    active,

    findSecret,

    createSecret,

    deleteSecret,

    updateSecret

};