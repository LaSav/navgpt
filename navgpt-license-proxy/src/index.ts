type Route = 'activate' | 'validate';

function corsHeaders(origin: string | null) {
	// For extensions, Origin may be null. We'll allow all for simplicity.
	return {
		'Access-Control-Allow-Origin': origin ?? '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Accept',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}

function json(body: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {}),
		},
	});
}

function formBody(params: Record<string, string>): string {
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) usp.set(k, v);
	return usp.toString();
}

/**
 * Super-light rate limit: per-IP per-minute using Cache API (no DB).
 * Good enough to prevent accidental hammering.
 */
async function rateLimit(request: Request, limitPerMinute: number) {
	const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

	const minute = Math.floor(Date.now() / 60000);
	const key = `https://rl/${ip}/${minute}`;

	const cache = caches.default;
	const hit = await cache.match(key);
	const count = hit ? Number(await hit.text()) : 0;

	if (count >= limitPerMinute) {
		return { ok: false as const };
	}

	const next = count + 1;
	await cache.put(key, new Response(String(next), { headers: { 'Cache-Control': 'max-age=60' } }));

	return { ok: true as const };
}

async function forwardToLemon(route: Route, payload: any) {
	const target =
		route === 'activate' ? 'https://api.lemonsqueezy.com/v1/licenses/activate' : 'https://api.lemonsqueezy.com/v1/licenses/validate';

	let body: string;

	if (route === 'activate') {
		const license_key = String(payload?.licenseKey ?? payload?.license_key ?? '').trim();
		const instance_name = String(payload?.instanceName ?? payload?.instance_name ?? '').trim();
		if (!license_key || !instance_name) {
			return { status: 400, body: { error: 'missing_params', message: 'licenseKey and instanceName are required' } };
		}
		body = formBody({ license_key, instance_name });
	} else {
		const license_key = String(payload?.licenseKey ?? payload?.license_key ?? '').trim();
		const instance_id = String(payload?.instanceId ?? payload?.instance_id ?? '').trim();
		if (!license_key) {
			return { status: 400, body: { error: 'missing_params', message: 'licenseKey is required' } };
		}
		body = formBody(instance_id ? { license_key, instance_id } : { license_key });
	}

	// Lemon’s License API uses form-encoded POST bodies and returns JSON.
	const res = await fetch(target, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body,
	});

	// Return Lemon’s response body as-is (JSON), preserving status code.
	const text = await res.text();
	let parsed: any;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = { raw: text };
	}

	if (parsed?.meta) {
		delete parsed.meta.customer_email;
		delete parsed.meta.customer_name;
	}

	return { status: res.status, body: parsed };
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');

		// CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders(origin) });
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
		}

		const route = url.pathname.replace('/', '') as Route;
		if (route !== 'activate' && route !== 'validate') {
			return new Response('Not Found', { status: 404, headers: corsHeaders(origin) });
		}

		// Rate limit (tune as you like)
		const rl = await rateLimit(request, 60);
		if (!rl.ok) {
			return json({ error: 'rate_limited', retry_after_seconds: 60 }, { status: 429, headers: corsHeaders(origin) });
		}

		// Accept JSON (preferred) or form-encoded
		const ct = request.headers.get('Content-Type') || '';
		let payload: any = {};
		if (ct.includes('application/json')) {
			payload = await request.json();
		} else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
			const form = await request.formData();
			payload = Object.fromEntries(form.entries());
		} else {
			// try JSON as a last resort
			try {
				payload = await request.json();
			} catch {
				payload = {};
			}
		}

		try {
			const r = await forwardToLemon(route, payload);
			return json(r.body, { status: r.status, headers: corsHeaders(origin) });
		} catch (e: any) {
			return json({ error: 'proxy_error', message: String(e?.message ?? e) }, { status: 502, headers: corsHeaders(origin) });
		}
	},
};
