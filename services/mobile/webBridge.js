"use strict";
/*
| services/mobile/webBridge.js
| বিদ্যমান Web Router-এর Handler (যেমন Dashboard, Area) Mobile থেকে ভেতরে ডেকে পুনঃব্যবহার করে —
| ফলে Web-এর Business Logic ও Permission নিয়ম হুবহু একই থাকে, নকল করতে হয় না।
| Web ফাইলে কোনো পরিবর্তন লাগে না। Express 5-সামঞ্জস্যপূর্ণ (req.query getter তাই defineProperty)।
| শুধু Bearer-যাচাই-পাস করা অনুরোধ (req.auth) থেকেই ডাকা যাবে।
*/

function webSession(auth) {
    return {
        user_id: auth.userId, username: auth.username, fullname: auth.fullname,
        role: auth.role, company_id: auth.companyId,
        client_type: null, customer_id: null          // Mobile Token-এ Web Session-এর এই ফিল্ড অপ্রয়োজনীয়
    };
}

function invokeRouter(router, mobileReq, { method = "GET", url, query = {}, body = {} }, timeoutMs = 20000) {
    if (!mobileReq.auth || mobileReq.auth.type !== "admin") {
        return Promise.reject(new Error("webBridge: unauthenticated"));
    }
    return new Promise((resolve, reject) => {
        const inner = Object.create(mobileReq);
        const own = { method, url, originalUrl: url, baseUrl: "", params: {}, query, body,
            session: webSession(mobileReq.auth), _parsedUrl: undefined };
        for (const [k, v] of Object.entries(own)) {
            Object.defineProperty(inner, k, { value: v, writable: true, configurable: true, enumerable: true });
        }

        let status = 200, done = false;
        const finish = (payload) => { if (!done) { done = true; clearTimeout(timer); resolve(payload); } };
        const out = {
            locals: {}, headersSent: false,
            status(c) { status = c; return out; },
            json(b) { finish({ status, body: b }); return out; },
            send(b) { finish({ status, body: b }); return out; },
            end() { finish({ status, body: null }); return out; },
            sendStatus(c) { status = c; finish({ status, body: null }); return out; },
            redirect() { finish({ status: 401, body: { success: false, message: "Not allowed." } }); return out; },
            sendFile() { finish({ status: 404, body: null }); return out; },
            set() { return out; }, setHeader() { return out; }, header() { return out; },
            type() { return out; }, cookie() { return out; }, clearCookie() { return out; },
            getHeader() { return undefined; }
        };
        const timer = setTimeout(() => {
            if (!done) { done = true; reject(new Error("webBridge: timeout")); }
        }, timeoutMs);

        try {
            router(inner, out, (err) => {
                if (err) { if (!done) { done = true; clearTimeout(timer); reject(err); } }
                else finish({ status: 404, body: { success: false, message: "Not found." } });
            });
        } catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
    });
}

module.exports = { invokeRouter, webSession };
