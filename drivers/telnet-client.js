'use strict';
const net = require('net');

class TelnetClient {
  constructor({ host, port = 23, timeout = 12000, commandDelay = 250 }) {
    this.host = host; this.port = Number(port); this.timeout = timeout;
    this.commandDelay = commandDelay; this.socket = null; this.buffer = '';
  }
  async connect() {
    if (!this.host || !Number.isInteger(this.port) || this.port < 1 || this.port > 65535) throw new Error('Invalid OLT host/port');
    this.socket = net.createConnection({ host: this.host, port: this.port });
    this.socket.setTimeout(this.timeout);
    this.socket.on('timeout', () => this.socket?.destroy(new Error('Telnet timeout')));
    this.socket.on('data', d => { this.buffer += d.toString('utf8').replace(/\x00/g, ''); });
    await new Promise((resolve, reject) => {
      const fail = e => { cleanup(); reject(e); };
      const done = () => { cleanup(); resolve(); };
      const cleanup = () => { this.socket?.off('error', fail); this.socket?.off('connect', done); };
      this.socket.once('error', fail); this.socket.once('connect', done);
    });
  }
  write(line) { if (!this.socket || this.socket.destroyed) throw new Error('Telnet disconnected'); this.socket.write(String(line)); }
  async waitFor(regexes, timeout = this.timeout) {
    const list = (Array.isArray(regexes) ? regexes : [regexes]).map(x => x instanceof RegExp ? x : new RegExp(x, 'i'));
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (let i = 0; i < list.length; i++) if (list[i].test(this.buffer)) { const text = this.buffer; this.buffer = ''; return { index: i, text }; }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Timeout waiting for OLT prompt');
  }
  async login(username, password) {
    await new Promise(r => setTimeout(r, 400));
    let text = this.buffer;
    for (let i = 0; i < 4; i++) {
      if (/(user\s*name|username|login)\s*[:：>]\s*$/im.test(text)) {
        this.buffer = ''; this.write(String(username || '') + '\r\n');
        text = (await this.waitFor([/password\s*[:：>]\s*$/im, /(?:^|\n).*?[>#]\s*$/m, /incorrect|failed|denied/i])).text;
      }
      if (/password\s*[:：>]\s*$/im.test(text)) {
        this.buffer = ''; this.write(String(password || '') + '\r\n');
        text = (await this.waitFor([/(?:^|\n).*?[>#]\s*$/m, /\(config[^)]*\)\s*$/im, /incorrect|failed|denied|authentication/i])).text;
      }
      if (/incorrect|failed|denied|authentication/i.test(text)) throw new Error('OLT login failed; check credentials');
      if (/(?:^|\n)\s*[^\n]*(?:#|>|\(config[^)]*\))\s*$/im.test(text)) return true;
      this.write('\r\n');
      try { text = (await this.waitFor([/username\s*[:：>]\s*$/im, /login\s*[:：>]\s*$/im, /password\s*[:：>]\s*$/im, /(?:^|\n).*?[>#]\s*$/m, /\(config[^)]*\)\s*$/im, /incorrect|failed|denied/i], 2500)).text; }
      catch { text = this.buffer; }
    }
    throw new Error('TCP connected, but CLI login could not be verified');
  }
  async command(command, timeout = this.timeout) {
    this.buffer = ''; this.write(String(command) + '\r\n');
    const start = Date.now(); let output = '';
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 100)); output += this.buffer; this.buffer = '';
      if (/--More--|More\s*:\s*$/i.test(output)) { this.write(' '); output = output.replace(/--More--|More\s*:\s*$/ig, ''); continue; }
      if (/(?:^|\n)\s*[^\n]*(?:#|>|\(config[^)]*\))\s*$/m.test(output) && Date.now() - start > this.commandDelay) {
        return output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '').trim();
      }
    }
    throw new Error('Timeout executing OLT command: ' + command);
  }
  async prepare() {
    for (const cmd of ['enable', 'config', 'terminal length 0']) { try { await this.command(cmd, 3000); } catch (_) {} }
  }
  close() { if (this.socket && !this.socket.destroyed) this.socket.end(); this.socket = null; }
}
module.exports = TelnetClient;
