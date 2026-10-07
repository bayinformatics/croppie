import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.LEAN_PORT || 4197);
const prefixes = ['/experiments/lean-cropper/dist/', '/experiments/lean-cropper/checks/fixtures/'];
const files = new Set(['/experiments/lean-cropper/checks/harness.html', '/docs/images/garden-1600.jpg', '/docs/images/garden-5120.jpg']);
const server = Bun.serve({ port, hostname: '127.0.0.1', async fetch(request) {
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) ||
      (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)) return new Response('Forbidden', { status: 403 });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (url.pathname === '/') return Response.redirect(`${url.origin}/experiments/lean-cropper/dist/`);
  let route: string;
  try { route = decodeURIComponent(url.pathname); } catch { return new Response('Bad path', { status: 400 }); }
  if (route.split('/').some(part => part.startsWith('.'))) return new Response('Forbidden', { status: 403 });
  const prefix = prefixes.find(prefix => route.startsWith(prefix));
  if (!prefix && !files.has(route)) return new Response('Not found', { status: 404 });
  const path = resolve(root, '.' + route + (route.endsWith('/') ? 'index.html' : ''));
  try {
    const canonical = await realpath(path);
    const allowed = prefix ? canonical.startsWith(resolve(root, '.' + prefix) + sep) : canonical === path;
    if (!allowed) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(canonical);
    return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 });
  } catch { return new Response('Not found', { status: 404 }); }
} });
console.log(`Lean cropper: http://127.0.0.1:${server.port}/experiments/lean-cropper/dist/`);
