import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.LEAN_PORT || 4197);
Bun.serve({ port, hostname: '127.0.0.1', async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/') return Response.redirect(`${url.origin}/experiments/lean-cropper/dist/`);
  let path: string;
  try { path = resolve(root, '.' + decodeURIComponent(url.pathname)); } catch { return new Response('Bad path', { status: 400 }); }
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) return new Response('Forbidden', { status: 403 });
  if (url.pathname.endsWith('/')) path += '/index.html';
  const file = Bun.file(path);
  return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 });
} });
console.log(`Lean cropper: http://127.0.0.1:${port}/experiments/lean-cropper/dist/`);
