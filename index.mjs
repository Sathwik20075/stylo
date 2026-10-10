// Stylo preview service (Cloudflare Worker).
// Holds the Gemini API key, limits usage, and turns a person's photos plus an outfit into one preview image.
// Photos are processed in memory only. Nothing is logged or stored except small daily counters.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_PERSON = 2;
const MAX_GARMENTS = 6;
const MAX_PERSON_B64 = 600_000;
const MAX_GARMENT_B64 = 300_000;

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

function corsHeaders(origin, env) {
  const allowed = originAllowed(origin, env);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function originAllowed(origin, env) {
  if (origin === 'null') return String(env.ALLOW_NULL_ORIGIN || 'true') === 'true'; // the desktop app
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin);
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Accepts a data URL or bare base64 and returns clean base64 of a JPEG, or null.
function cleanJpeg(value, maxLen) {
  if (typeof value !== 'string') return null;
  const b64 = value.replace(/^data:image\/jpeg;base64,/, '');
  if (b64.length < 100 || b64.length > maxLen) return null;
  if (!B64.test(b64)) return null;
  if (!b64.startsWith('/9j/')) return null; // JPEG signature
  return b64;
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readCount(kv, key) {
  return Number((await kv.get(key)) || 0);
}
async function bump(kv, key, delta) {
  const next = Math.max(0, (await readCount(kv, key)) + delta);
  await kv.put(key, String(next), { expirationTtl: 172800 });
  return next;
}

function buildPrompt(personCount, labels) {
  return [
    'Create one realistic full-length fashion photograph.',
    `The first ${personCount} image${personCount > 1 ? 's show' : ' shows'} the same real person (reference photos of their face and body).`,
    `The remaining images are the exact clothing items and accessories to dress them in: ${labels.join('; ')}.`,
    'Show this exact person standing naturally, full body, wearing all of these items together as a single outfit.',
    "Keep the person's face, hairstyle, facial hair, skin tone and natural body proportions exactly as in the reference photos. Do not replace them with a different person.",
    "Keep every garment's exact colour, pattern and design. Do not add, remove, recolour or substitute any clothing.",
    'Plain light studio background, soft natural lighting, realistic fabric and fit, portrait 3:4 framing.',
  ].join(' ');
}

function findImage(j) {
  if (j && j.output_image && j.output_image.data) return { data: j.output_image.data, mime: j.output_image.mime_type || 'image/jpeg' };
  for (const step of (j && j.steps) || []) {
    if (step.type !== 'model_output') continue;
    for (const c of step.content || []) if (c.type === 'image' && c.data) return { data: c.data, mime: c.mime_type || 'image/jpeg' };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return json({ ok: true }, 200, cors);
    if (url.pathname !== '/preview' || request.method !== 'POST') return json({ error: 'not_found' }, 404, cors);
    if (!originAllowed(origin, env)) return json({ error: 'forbidden' }, 403, cors);

    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400, cors); }

    if (body.consent !== true || body.adult !== true) return json({ error: 'consent_required' }, 400, cors);
    const deviceId = typeof body.deviceId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.deviceId) ? body.deviceId : null;
    if (!deviceId) return json({ error: 'bad_request' }, 400, cors);

    const person = (Array.isArray(body.person) ? body.person : []).slice(0, MAX_PERSON).map((p) => cleanJpeg(p, MAX_PERSON_B64));
    const garments = (Array.isArray(body.garments) ? body.garments : []).slice(0, MAX_GARMENTS).map((g) => cleanJpeg(g, MAX_GARMENT_B64));
    if (!person.length || person.includes(null) || !garments.length || garments.includes(null)) {
      return json({ error: 'bad_images' }, 400, cors);
    }
    const labels = (Array.isArray(body.labels) ? body.labels : [])
      .slice(0, MAX_GARMENTS)
      .map((l) => String(l).replace(/[^A-Za-z0-9 ,.'()+-]/g, '').slice(0, 60))
      .filter(Boolean);

    // ----- limits -----
    const kv = env.LIMITS;
    const day = new Date().toISOString().slice(0, 10);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const keys = {
      dev: `dev:${deviceId}:${day}`,
      ip: `ip:${await sha(ip + (env.IP_SALT || ''))}:${day}`,
      all: `all:${day}`,
    };
    const perDevice = num(env.PER_DEVICE, 3), perIp = num(env.PER_IP, 10), cap = num(env.DAILY_CAP, 100);
    const [d, i, a] = await Promise.all([readCount(kv, keys.dev), readCount(kv, keys.ip), readCount(kv, keys.all)]);
    if (a >= cap) return json({ error: 'paused', remaining: 0 }, 503, cors);
    if (d >= perDevice) return json({ error: 'device_limit', remaining: 0 }, 429, cors);
    if (i >= perIp) return json({ error: 'ip_limit', remaining: 0 }, 429, cors);
    await Promise.all([bump(kv, keys.dev, 1), bump(kv, keys.ip, 1), bump(kv, keys.all, 1)]);
    const refund = () => Promise.all([bump(kv, keys.dev, -1), bump(kv, keys.ip, -1), bump(kv, keys.all, -1)]);

    // ----- call the image model -----
    const input = [{ type: 'text', text: buildPrompt(person.length, labels.length ? labels : ['the outfit shown']) }];
    for (const data of [...person, ...garments]) input.push({ type: 'image', mime_type: 'image/jpeg', data });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          model: env.MODEL || 'gemini-nano-banana-2.1',
          input,
          response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '3:4', image_size: '1K' },
          generation_config: { thinking_level: env.THINKING || 'minimal' },
        }),
      });
      if (!res.ok) {
        await refund();
        console.log('upstream status', res.status);
        return json({ error: 'upstream' }, 502, cors);
      }
      const image = findImage(await res.json());
      if (!image) {
        await refund();
        return json({ error: 'no_image' }, 422, cors);
      }
      return json({ mime: image.mime, data: image.data, remaining: Math.max(0, perDevice - (d + 1)) }, 200, cors);
    } catch {
      await refund();
      return json({ error: 'upstream' }, 502, cors);
    } finally {
      clearTimeout(timer);
    }
  },
};
