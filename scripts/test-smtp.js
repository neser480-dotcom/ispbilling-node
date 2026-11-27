/*
 * VPS-এ OTP/ইমেইল কেন যাচ্ছে না তা বের করার টেস্ট।
 * চালান:  node scripts/test-smtp.js you@gmail.com
 * (প্রজেক্ট ফোল্ডার থেকে, যেখানে .env আছে)
 */
require("dotenv").config();
const net = require("net");
const nodemailer = require("nodemailer");

const to = process.argv[2] || process.env.SMTP_USER;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);

function check(name, ok, extra) {
    console.log((ok ? "OK    " : "FAIL  ") + name + (extra ? " -> " + extra : ""));
    return ok;
}

(async () => {
    console.log("---- 1) .env মান ----");
    check("SMTP_HOST", !!host, host || "নেই");
    check("SMTP_PORT", true, String(port));
    check("SMTP_SECURE", true, String(process.env.SMTP_SECURE || "(নেই = false)"));
    check("SMTP_USER", !!process.env.SMTP_USER, process.env.SMTP_USER || "নেই");
    check("SMTP_PASS", !!process.env.SMTP_PASS,
        process.env.SMTP_PASS ? `${String(process.env.SMTP_PASS).length} অক্ষর` : "নেই");
    check("SESSION_SECRET", !!process.env.SESSION_SECRET, process.env.SESSION_SECRET ? "আছে" : "নেই");
    if (!host || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log("\n=> .env-এ SMTP_HOST / SMTP_USER / SMTP_PASS ঠিক করে pm2 restart দিন।");
        return;
    }

    console.log("\n---- 2) VPS থেকে SMTP পোর্টে সংযোগ ----");
    const reachable = await new Promise(resolve => {
        const s = net.connect({ host, port, timeout: 8000 });
        s.on("connect", () => { s.destroy(); resolve(true); });
        s.on("timeout", () => { s.destroy(); resolve("timeout"); });
        s.on("error", e => resolve(e.code || e.message));
    });
    if (!check(`${host}:${port}`, reachable === true, reachable === true ? "" : String(reachable))) {
        console.log("\n=> VPS থেকে এই পোর্ট খোলা নেই (প্রোভাইডার/ফায়ারওয়াল ব্লক)।");
        console.log("   465 (SMTP_SECURE=true) বা 2525 চেষ্টা করুন, অথবা VPS প্রোভাইডারকে পোর্ট খুলতে বলুন।");
        console.log("   ufw ব্যবহার করলে: sudo ufw allow out 587/tcp  &&  sudo ufw allow out 465/tcp");
        return;
    }

    console.log("\n---- 3) লগইন যাচাই + টেস্ট মেইল ----");
    const transporter = nodemailer.createTransport({
        host, port,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
    });
    try {
        await transporter.verify();
        check("SMTP login", true);
    } catch (e) {
        check("SMTP login", false, `${e.code || ""} ${e.message}`);
        if (/535|Username and Password|Invalid login/i.test(e.message)) {
            console.log("\n=> Gmail পাসওয়ার্ড ভুল। সাধারণ পাসওয়ার্ড চলে না:");
            console.log("   Google Account > Security > 2-Step Verification চালু > App passwords থেকে ১৬ অক্ষরের পাসওয়ার্ড বানিয়ে SMTP_PASS-এ দিন (স্পেস ছাড়া)।");
        }
        return;
    }
    try {
        const info = await transporter.sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to, subject: "AmaderBill SMTP test", text: "SMTP ঠিক আছে।"
        });
        check("মেইল পাঠানো", true, info.response);
        console.log(`\n=> ${to} এ ইনবক্স ও Spam দেখুন।`);
    } catch (e) {
        check("মেইল পাঠানো", false, `${e.code || ""} ${e.message}`);
    }
})();
