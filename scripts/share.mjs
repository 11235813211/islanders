import { createServer, request as upstreamRequest } from 'node:http';
import { readFile, writeFile, stat, utimes } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const port = Number(process.env.SHARE_PORT || 4174);
const apiRoute = /^\/api\/(?:health|accounts\/(?:register|login|logout|me)|rooms(?:\/[A-Z0-9]{5,14}\/(?:join|socket))?)$/;
const socketRoute = /^\/api\/rooms\/[A-Z0-9]{5,14}\/socket$/;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
try { await stat(resolve(dist, 'index.html')); if (!(await fetch('http://127.0.0.1:8787/api/health')).ok) throw new Error(); }
catch { console.error('First run npm run build, then keep npm run dev running in another terminal.'); process.exit(1); }

function proxyOptions(req) {
  const headers = { ...req.headers, host: '127.0.0.1:8787' };
  delete headers['cf-connecting-ip']; delete headers['x-forwarded-for']; delete headers['x-forwarded-host'];
  return { hostname: '127.0.0.1', port: 8787, path: req.url, method: req.method, headers };
}
const gateway = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://gateway').pathname;
    if (apiRoute.test(pathname)) {
      const upstream = upstreamRequest(proxyOptions(req), response => { res.writeHead(response.statusCode ?? 502, { ...response.headers, ...security }); response.pipe(res); });
      upstream.setTimeout(30_000, () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Game server unavailable.'); });
      req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.')) || decoded.startsWith('/api/') || decoded.startsWith('/cdn-cgi/')) throw new Error('Blocked');
    const file = resolve(dist, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!file.startsWith(dist + '/') || !(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { ...security, 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  } catch { res.writeHead(404, security); res.end('Not found'); }
});
gateway.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://gateway').pathname;
  if (!socketRoute.test(pathname)) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
  const upstream = upstreamRequest(proxyOptions(req));
  upstream.on('upgrade', (response, peer, peerHead) => {
    const headers = Object.entries(response.headers).flatMap(([key, value]) => Array.isArray(value) ? value.map(v => `${key}: ${v}`) : [`${key}: ${value}`]);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (head.length) peer.write(head); if (peerHead.length) socket.write(peerHead);
    socket.pipe(peer); peer.pipe(socket);
    socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy());
    socket.on('close', () => peer.destroy()); peer.on('close', () => socket.destroy());
  });
  upstream.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`); response.resume(); });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(port, '127.0.0.1', resolve); });
let tunnel;
const stop = () => { tunnel?.kill('SIGTERM'); gateway.close(); setTimeout(() => process.exit(0), 100).unref(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
if (process.env.SHARE_LOCAL_ONLY === '1') {
  console.log(`Safe gateway ready: http://127.0.0.1:${port}`);
} else {
  tunnel = spawn(process.env.CLOUDFLARED_BIN || (existsSync(resolve(root, '.tools/cloudflared')) ? resolve(root, '.tools/cloudflared') : 'cloudflared'), ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnel.on('error', () => { console.error('Install cloudflared first: brew install cloudflared'); gateway.close(); process.exitCode = 1; });
  tunnel.on('exit', code => { gateway.close(); if (code) { console.error(tail.slice(-1600)); process.exitCode = code; } });
  let found = false;
  let tail = '';
  async function output(chunk) {
    tail = (tail + chunk.toString()).slice(-8000);
    const origin = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (!origin || found) return;
    found = true;
    const envFile = resolve(root, '.dev.vars');
    const existing = await readFile(envFile, 'utf8').catch(() => '');
    const match = existing.match(/^ALLOWED_ORIGINS\s*=\s*(.*)$/m);
    const previous = match ? match[1].replace(/^["']|["']$/g, '') : 'http://localhost:5173,http://127.0.0.1:5173';
    const origins = [...new Set([...previous.split(',').filter(value => !value.endsWith('.trycloudflare.com')), origin])];
    const line = `ALLOWED_ORIGINS=${JSON.stringify(origins.join(','))}`;
    await writeFile(envFile, match ? existing.replace(match[0], line) : existing + '\n' + line + '\n');
    // Wrangler watches its config, but does not always watch newly created .dev.vars.
    const configTime = new Date();
    await utimes(resolve(root, 'wrangler.jsonc'), configTime, configTime);
    for (let attempt = 0; attempt < 30; attempt++) {
      const ready = await fetch('http://127.0.0.1:8787/api/rooms/NOTFOUND99/join', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"name":"Connection check"}' }).catch(() => null);
      if (ready?.status === 404) { console.log(`\nHTTPS playtest link: ${origin}\nKeep this terminal and npm run dev running. The link changes when sharing restarts.\n`); return; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.error('Origin configuration did not reload. Restart npm run dev, then use: ' + origin);
  }
  tunnel.stderr.on('data', chunk => { void output(chunk).catch(error => { console.error(error.message); stop(); }); });
  tunnel.stdout.on('data', chunk => { void output(chunk).catch(error => { console.error(error.message); stop(); }); });
  console.log('Starting an HTTPS playtest tunnel. Developer tools are not exposed.');
}
