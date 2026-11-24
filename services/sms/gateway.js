// Pluggable SMS gateways. Choose with SMS_PROVIDER in .env: mock | bulksmsbd | greenweb | custom
// NOTE: verify the URL/params of your chosen provider against their current API docs.
const https = require('https');
const http = require('http');
const { URL } = require('url');

function httpGet(u) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    const lib = url.protocol === 'https:' ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

const providers = {
  // Prints to console, always succeeds. Use while developing.
  async mock({ to, message }) {
    console.log(`[SMS mock] -> ${to}: ${message}`);
    return { ok: true };
  },

  async bulksmsbd({ to, message, channel }) {
    const q = new URLSearchParams({
      api_key: process.env.SMS_API_KEY || '',
      type: 'text',
      number: to,
      senderid: channel === 'masking' ? process.env.SMS_MASK_SENDER || '' : process.env.SMS_SENDER_ID || '',
      message,
    });
    const r = await httpGet(`http://bulksmsbd.net/api/smsapi?${q}`);
    return { ok: r.status === 200 && /202/.test(r.body), error: r.body.slice(0, 200) };
  },

  async greenweb({ to, message }) {
    const q = new URLSearchParams({ token: process.env.SMS_API_KEY || '', to, message });
    const r = await httpGet(`https://api.bdbulksms.net/api.php?${q}`);
    return { ok: r.status === 200 && /^Ok/i.test(r.body.trim()), error: r.body.slice(0, 200) };
  },

  // Any GET-style API: SMS_CUSTOM_URL="https://x.com/send?key=K&to={to}&text={message}"
  async custom({ to, message }) {
    const u = (process.env.SMS_CUSTOM_URL || '')
      .replace('{to}', encodeURIComponent(to))
      .replace('{message}', encodeURIComponent(message));
    const r = await httpGet(u);
    return { ok: r.status >= 200 && r.status < 300, error: r.body.slice(0, 200) };
  },
};

async function sendOne(args) {
  const name = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  const fn = providers[name];
  if (!fn) return { ok: false, error: `Unknown SMS_PROVIDER: ${name}` };
  try {
    return await fn(args);
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { sendOne };
