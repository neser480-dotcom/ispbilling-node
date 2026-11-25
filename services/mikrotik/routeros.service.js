'use strict';

const { MikrotikAPI } = require('@fibercom/routeros-api');

function makeClient(router) {
    const useSsl =
        Number(router.use_ssl) === 1 ||
        router.use_ssl === true;

    const configuredPort =
        Number(router.port || 0);

    const port =
        configuredPort > 0
            ? configuredPort
            : (useSsl ? 8729 : 8728);

    return new MikrotikAPI({
        host: String(router.ip || '').trim(),
        user: String(router.username || ''),
        password: String(router.password || ''),
        port,
        tls: useSsl,
        timeout: Number(router.timeout || 5)
    });
}

async function withRouter(router, callback) {
    const api = makeClient(router);

    try {
        await api.connect();

        return await callback(api);

    } finally {

        if (api.connected) {
            await api.close();
        }
    }
}

async function findSecret(router, username) {
    return withRouter(router, async (api) => {

        const rows = await api.write([
            '/ppp/secret/print',
            `?name=${String(username)}`,
            '=.proplist=.id,name'
        ]);

        return Array.isArray(rows) ? rows : [];
    });
}


/*
|--------------------------------------------------------------------------
| ADD PPPoE SECRET
|--------------------------------------------------------------------------
| Package profile à¦à¦–à¦¨ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ MikroTik-à¦ à¦ªà¦¾à¦ à¦¾à¦¨à§‹ à¦¹à¦¬à§‡à¥¤
|
| Controller à¦¥à§‡à¦•à§‡:
|
| profile: selectedPackage.profile_id
|
| MikroTik command:
|
| /ppp/secret/add
| =name=...
| =password=...
| =service=pppoe
| =profile=PACKAGE_PROFILE
| =comment=...
|
*/

async function addPppoeSecret(
    router,
    {
        username,
        password,
        comment,
        profile
    }
) {

    return withRouter(router, async (api) => {

        const command = [
            '/ppp/secret/add',
            `=name=${String(username)}`,
            `=password=${String(password)}`,
            '=service=pppoe'
        ];

        /*
        |--------------------------------------------------------------------------
        | PACKAGE PROFILE
        |--------------------------------------------------------------------------
        | Profile à¦¥à¦¾à¦•à¦²à§‡ à¦¸à§‡à¦Ÿà¦¾à¦‡ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦¹à¦¬à§‡à¥¤
        | Profile à¦¨à¦¾ à¦¥à¦¾à¦•à¦²à§‡ profile parameter à¦ªà¦¾à¦ à¦¾à¦¨à§‹ à¦¹à¦¬à§‡ à¦¨à¦¾,
        | à¦«à¦²à§‡ MikroTik-à¦à¦° default profile à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦¹à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¥¤
        */

        const selectedProfile =
            String(profile || '').trim();

        if (selectedProfile !== '') {
            command.push(
                `=profile=${selectedProfile}`
            );
        }

        /*
        |--------------------------------------------------------------------------
        | COMMENT
        |--------------------------------------------------------------------------
        */

        command.push(
            `=comment=${String(comment || '')}`
        );

        return api.write(command);
    });
}


module.exports = {
    findSecret,
    addPppoeSecret,
	withRouter
};
