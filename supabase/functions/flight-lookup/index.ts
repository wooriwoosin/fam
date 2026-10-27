/**
 * ✈️ 항공편 자동 불러오기 — Supabase Edge Function "flight-lookup"
 *
 * 화면이 { flight: 'KE461', date: '2026-10-30' } 를 보내면 AeroDataBox(RapidAPI)에서 찾아
 * 출발·도착 공항, 현지 시각, 터미널, 게이트 등을 돌려줌.
 *
 * - API 키는 Supabase 비밀 설정(AERODATABOX_KEY)에만 있음 → 공개 화면에 키가 드러나지 않음
 * - 같은 편명·날짜는 캐시(flight_cache)에서 돌려줌 (출발 이틀 전부터는 20분, 그 전엔 12시간)
 * - 하루 호출 한도(FLIGHT_DAILY_LIMIT, 기본 15번)를 넘으면 쉼 → 누가 마구 불러도 요금·한도 보호
 *
 * 대시보드 → Edge Functions → Deploy a new function → Via Editor → 이름 flight-lookup → 이 파일 내용 붙여 넣기 → Deploy
 * 그다음 함수 설정에서 "Verify JWT"(JWT 확인)를 꺼 주세요 (sb_publishable_ 키는 JWT가 아니라서).
 */

const KEY = Deno.env.get('AERODATABOX_KEY') ?? '';
const HOST = Deno.env.get('AERODATABOX_HOST') ?? 'aerodatabox.p.rapidapi.com';
const DAILY_LIMIT = Number(Deno.env.get('FLIGHT_DAILY_LIMIT') ?? '15');
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Supabase DB (서비스 키 — 함수 안에서만 씀)
function sb(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { apikey: SB_KEY, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) };
  if (!SB_KEY.startsWith('sb_')) headers.Authorization = 'Bearer ' + SB_KEY;
  return fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers });
}

// "2026-10-30 10:30+09:00" → "2026-10-30T10:30"
const localTime = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v) ? v.slice(0, 10) + 'T' + v.slice(11, 16) : '');
// deno-lint-ignore no-explicit-any
const timeOf = (side: any, kind: 'scheduled' | 'revised') =>
  localTime(side?.[kind + 'Time']?.local ?? side?.[kind + 'TimeLocal']);

// deno-lint-ignore no-explicit-any
function sideOf(s: any) {
  const a = s?.airport ?? {};
  return {
    iata: a.iata ?? '', name: a.shortName ?? a.name ?? '', city: a.municipalityName ?? '', cc: a.countryCode ?? '', tz: a.timeZone ?? '',
    time: timeOf(s, 'scheduled'), revised: timeOf(s, 'revised'),
    terminal: s?.terminal ?? '', gate: s?.gate ?? '', checkIn: s?.checkInDesk ?? '', baggage: s?.baggageBelt ?? '',
  };
}
// deno-lint-ignore no-explicit-any
function normalize(f: any) {
  return {
    flightNo: String(f.number ?? '').replace(/\s+/g, ''), airline: f.airline?.name ?? '', status: f.status ?? '',
    aircraft: f.aircraft?.model ?? '', dep: sideOf(f.departure), arr: sideOf(f.arrival),
  };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ ok: false, error: 'POST만 받아요' }, 405);
  if (!KEY) return reply({ ok: false, error: '항공 정보 키(AERODATABOX_KEY)가 아직 설정되지 않았어요' }, 503);

  let body: { flight?: string; date?: string; fresh?: boolean };
  try { body = await req.json(); } catch { return reply({ ok: false, error: '요청을 읽을 수 없어요' }, 400); }
  const flight = String(body.flight ?? '').toUpperCase().replace(/[\s-]+/g, '');
  const date = String(body.date ?? '');
  if (!/^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(flight)) return reply({ ok: false, error: '편명을 확인해 주세요 (예: KE461)' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply({ ok: false, error: '날짜를 확인해 주세요' }, 400);

  const key = `${flight}|${date}`;
  const daysAway = (Date.parse(date) - Date.now()) / 86400000;
  const maxAgeMin = body.fresh ? 5 : daysAway < 2 ? 20 : 720;
  const db = !!(SB_URL && SB_KEY);

  if (db) {
    try {
      const r = await sb(`flight_cache?key=eq.${encodeURIComponent(key)}&select=data,fetched_at`);
      const [hit] = r.ok ? await r.json() : [];
      if (hit && Date.now() - Date.parse(hit.fetched_at) < maxAgeMin * 60000) return reply({ ok: true, cached: true, fetchedAt: hit.fetched_at, flights: hit.data });
      const u = await sb('rpc/bump_flight_usage', { method: 'POST', body: JSON.stringify({ max_calls: DAILY_LIMIT }) });
      if (u.ok && (await u.json()) === false) {
        if (hit) return reply({ ok: true, cached: true, fetchedAt: hit.fetched_at, flights: hit.data, note: '오늘 조회 한도를 넘어서 저장된 정보를 보여 드려요' });
        return reply({ ok: false, error: '오늘 항공편 조회 한도를 다 썼어요. 내일 다시 시도하거나 직접 입력해 주세요' }, 429);
      }
    } catch (_) { /* 캐시·한도는 실패해도 조회는 계속 */ }
  }

  const res = await fetch(`https://${HOST}/flights/number/${flight}/${date}?withAircraftImage=false&withLocation=false`, {
    headers: { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST },
  });
  if (res.status === 204 || res.status === 404) return reply({ ok: true, flights: [] });
  if (res.status === 401 || res.status === 403) return reply({ ok: false, error: '항공 정보 키가 맞지 않거나 구독이 안 되어 있어요' }, 502);
  if (res.status === 429) return reply({ ok: false, error: '항공 정보 서비스의 이번 달 무료 한도를 다 썼어요. 직접 입력해 주세요' }, 429);
  if (!res.ok) return reply({ ok: false, error: `항공 정보 서비스 오류 (${res.status})` }, 502);
  const raw = await res.json();
  const flights = (Array.isArray(raw) ? raw : []).map(normalize).filter(f => f.dep.iata || f.arr.iata);

  if (db) {
    try {
      await sb('flight_cache?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key, data: flights, fetched_at: new Date().toISOString() }) });
    } catch (_) { /* 캐시 저장 실패는 무시 */ }
  }
  return reply({ ok: true, flights, fetchedAt: new Date().toISOString() });
}

// deno-lint-ignore no-explicit-any
if (typeof (globalThis as any).Deno?.serve === 'function') Deno.serve(handle);
