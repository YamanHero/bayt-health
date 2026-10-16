// Bayt Health · bh-remind
// Sends Web Push reminders. Two callers:
//   1. pg_cron every 15 min with header x-cron-secret (mode 'cron'): sends due reminders, skipping ones already done today.
//   2. A signed-in user (mode 'test'): sends one test notification to that user's own devices.
// Secrets live in Supabase Vault and are read through public.bh_push_config() (service_role only).
import webpush from 'npm:web-push@3.6.7';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const base = () => (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const service = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
function anonKey(): string {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try { const k = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'); return k.default ?? (Object.values(k)[0] as string) ?? ''; } catch { return ''; }
}
const admin = (path: string, init: RequestInit = {}) => fetch(base() + path, {
  ...init,
  headers: { apikey: service(), Authorization: 'Bearer ' + service(), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
});
async function rows(path: string) { const r = await admin(path); return r.ok ? await r.json() : []; }

const TZ = 'Asia/Jerusalem';
function localNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), year: Number(parts.year) };
}
const toMin = (t: string | null) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; person_id: string; weigh_at: string | null; meals_at: string | null; move_at: string | null; last_sent: Record<string, string> };

async function send(sub: Sub, payload: Record<string, unknown>) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
    return 'ok';
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) { await admin(`/rest/v1/bh_push_subs?id=eq.${sub.id}`, { method: 'DELETE' }); return 'gone'; }
    console.error('push failed', code, String((e as Error).message ?? e).slice(0, 200));
    return 'error';
  }
}

async function messageFor(kind: string, sub: Sub, person: any, today: string, year: number) {
  const name = person?.name ?? '';
  const minor = person?.birth_year && year - person.birth_year < 18;
  if (kind === 'weigh') {
    if (minor) return null;
    const w = await rows(`/rest/v1/bh_weights?person_id=eq.${sub.person_id}&measured_on=eq.${today}&select=id&limit=1`);
    if (w.length) return null;
    return { title: '⚖️ وقت الوزن', body: `صباح الخير ${name}. قيس وزنك قبل الفطور وسجّله.`, url: '/?tab=weight', tag: 'bh-weigh' };
  }
  if (kind === 'meals') {
    const m = await rows(`/rest/v1/bh_meals?person_id=eq.${sub.person_id}&eaten_on=eq.${today}&select=slot`);
    const slots = new Set(m.map((x: any) => x.slot));
    const missing = ['breakfast', 'lunch', 'dinner'].filter((s) => !slots.has(s));
    if (!missing.length) return null;
    const labels: Record<string, string> = { breakfast: 'الفطور', lunch: 'الغدا', dinner: 'العشا' };
    const body = m.length === 0
      ? `${name}، لسا ما سجّلت أكل اليوم. صوّر الصحن أو اكتب جملة، وخلصنا.`
      : `${name}، ناقص تسجيل: ${missing.map((s) => labels[s]).join('، ')}.`;
    return { title: '🥗 يوميات الأكل', body, url: '/?add=meal', tag: 'bh-meals' };
  }
  if (kind === 'move') {
    const w = await rows(`/rest/v1/bh_workouts?person_id=eq.${sub.person_id}&done_on=eq.${today}&select=minutes`);
    const total = w.reduce((s: number, x: any) => s + (x.minutes || 0), 0);
    const target = minor ? 60 : 30;
    if (total >= target) return null;
    const body = total === 0
      ? `${name}، ${minor ? 'ساعة لعب أو حركة' : 'مشوار 30 دقيقة'} اليوم؟ بعدها سجّله بكبسة.`
      : `${name}، عملت ${total} دقيقة اليوم. ${target - total} دقيقة كمان وبتوصل الهدف.`;
    return { title: '🚶 وقت الحركة', body, url: '/?add=move', tag: 'bh-move' };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const cfgRes = await admin('/rest/v1/rpc/bh_push_config', { method: 'POST', body: '{}' });
  const cfg = cfgRes.ok ? await cfgRes.json() : null;
  if (!cfg?.vapid_private || !cfg?.vapid_public) return json(503, { error: 'push_not_configured' });
  webpush.setVapidDetails('mailto:bayt-health@users.noreply.github.com', cfg.vapid_public, cfg.vapid_private);

  const body = await req.json().catch(() => ({}));
  const now = localNow();

  // --- test: a signed-in user pings their own devices ---
  if (body?.mode === 'test') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const u = await fetch(base() + '/auth/v1/user', { headers: { apikey: anonKey(), Authorization: 'Bearer ' + token } });
    const user = u.ok ? await u.json() : null;
    if (!user?.id) return json(401, { error: 'unauthorized' });
    const subs: Sub[] = await rows(`/rest/v1/bh_push_subs?user_id=eq.${user.id}&select=*`);
    let sent = 0;
    for (const s of subs) if ((await send(s, { title: 'بيت الصحة ✓', body: 'التذكيرات شغّالة على هالجهاز.', url: '/', tag: 'bh-test' })) === 'ok') sent++;
    return json(200, { sent, devices: subs.length });
  }

  // --- cron ---
  if (!cfg.cron_secret || req.headers.get('x-cron-secret') !== cfg.cron_secret) return json(401, { error: 'unauthorized' });
  const subs: Sub[] = await rows('/rest/v1/bh_push_subs?select=*');
  const people = await rows('/rest/v1/bh_people?select=id,name,birth_year');
  const byId = new Map(people.map((p: any) => [p.id, p]));
  let sent = 0, checked = 0;
  for (const sub of subs) {
    const last = { ...(sub.last_sent ?? {}) };
    let changed = false;
    for (const kind of ['weigh', 'meals', 'move']) {
      const at = toMin((sub as any)[`${kind}_at`]);
      if (at == null || last[kind] === now.date) continue;
      if (now.minutes < at || now.minutes - at > 90) continue; // due window: up to 90 min late
      checked++;
      last[kind] = now.date; changed = true;
      const msg = await messageFor(kind, sub, byId.get(sub.person_id), now.date, now.year);
      if (msg && (await send(sub, msg)) === 'ok') sent++;
    }
    if (changed) await admin(`/rest/v1/bh_push_subs?id=eq.${sub.id}`, { method: 'PATCH', body: JSON.stringify({ last_sent: last }) });
  }
  return json(200, { sent, checked, subs: subs.length, at: now });
});
