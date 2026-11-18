"use strict";

/*
 * Small shared HTTP helper for payment providers.
 * Timeout, no redirects, JSON parsing, never throws secrets in messages.
 */

const TIMEOUT_MS = 25000;

class GatewayError extends Error {
    constructor(message, details) {
        super(message);
        this.name = "GatewayError";
        this.details = details || null;
    }
}

function hostAllowed(url, suffixes) {
    try {
        const host = new URL(url).hostname.toLowerCase();

        return suffixes.some(
            (suffix) => host === suffix || host.endsWith(`.${suffix}`)
        );
    } catch (_) {
        return false;
    }
}

async function requestJson(method, url, { headers = {}, json, form } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const finalHeaders = { Accept: "application/json", ...headers };
    let body;

    if (json !== undefined) {
        finalHeaders["Content-Type"] = "application/json";
        body = JSON.stringify(json);
    } else if (form) {
        finalHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams(form).toString();
    }

    try {
        const response = await fetch(url, {
            method,
            headers: finalHeaders,
            body,
            signal: controller.signal,
            redirect: "error"
        });

        const text = await response.text();

        let data = null;

        try {
            data = JSON.parse(text);
        } catch (_) {
            data = null;
        }

        if (data === null) {
            throw new GatewayError(
                `Gateway returned an unreadable response (HTTP ${response.status}).`,
                { status: response.status, body: text.slice(0, 300) }
            );
        }

        return { status: response.status, ok: response.ok, data };
    } catch (error) {
        if (error instanceof GatewayError) {
            throw error;
        }

        throw new GatewayError(
            error.name === "AbortError"
                ? "Gateway request timed out."
                : "Unable to reach the payment gateway.",
            { reason: error.message }
        );
    } finally {
        clearTimeout(timer);
    }
}

function sameAmount(a, b) {
    const x = Number(a);
    const y = Number(b);

    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Math.abs(x - y) < 0.005
    );
}

module.exports = { GatewayError, hostAllowed, requestJson, sameAmount };
