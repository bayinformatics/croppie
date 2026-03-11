import { resolve, normalize, join } from "node:path";

const ROOT = resolve(".");

const server = Bun.serve({
	port: 4173,
	async fetch(req) {
		const url = new URL(req.url);
		let pathname = decodeURIComponent(url.pathname);
		if (pathname === "/") pathname = "/index.html";

		const safe = resolve(join(ROOT, normalize(pathname)));
		if (!safe.startsWith(ROOT)) {
			return new Response("Forbidden", { status: 403 });
		}

		const file = Bun.file(safe);
		if (await file.exists()) {
			return new Response(file);
		}
		return new Response("Not found", { status: 404 });
	},
});

console.log(`Serving at http://localhost:${server.port}`);
