/**
 * ✈️ 항공편 · 🏨 숙소 (여행 상세 → 개요 맨 위)
 *
 * - 항공편: 구간(편명 하나)마다 한 줄. 경유는 24시간 안에 이어지는 구간을 한 여정으로 묶고 환승 시간을 보여 줌
 *   시간은 그 공항의 현지 시각으로 저장하고, 공항 시간대로 비행시간을 계산
 *   날짜+편명으로 🔍 불러오기 → Supabase Edge Function(flight-lookup)이 AeroDataBox에서 찾아 채워 줌 (없으면 직접 입력)
 * - 숙소: 구글에서 찾아 등록, 체크인~체크아웃으로 몇 박인지 · 빈 밤 알림 · 길찾기 · 택시 기사님께 보여 줄 현지어 주소
 */

let editingFlight = null;
let editingStay = null;
let flightChoices = null;   // 불러오기 결과가 여러 구간일 때 고르기

const AIRPORT_BY = {};
(window.AIRPORTS || []).forEach(a => { AIRPORT_BY[a.iata] = a; });

/* ───────── 시간 ───────── */
/** 그 시간대에서 utcMs 순간의 UTC와의 차이(분) */
function tzOffsetMin(tz, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
  const g = t => Number(parts.find(x => x.type === t).value);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - utcMs) / 60000;
}
/** 'YYYY-MM-DDTHH:MM' (그 공항 현지 시각) → UTC ms. 시간대를 모르면 null */
function localToUtc(local, tz) {
  if (!local || !tz || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  try {
    const naive = Date.parse(local.slice(0, 16) + ':00Z');
    let off = tzOffsetMin(tz, naive);
    off = tzOffsetMin(tz, naive - off * 60000);
    return naive - off * 60000;
  } catch (e) { return null; }
}
const hm = local => (local || '').slice(11, 16);
const fmtDur = min => min == null || min < 0 ? '' : `${Math.floor(min / 60) ? Math.floor(min / 60) + '시간 ' : ''}${min % 60 ? (min % 60) + '분' : ''}`.trim() || '0분';
const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const mdw = iso => iso ? `${md(iso)}(${weekday(iso.slice(0, 10))})` : '';

/* ───────── DB 줄 ↔ 화면 ───────── */
function rowToFlight(r) {
  return { id: String(r.id), journeyId: r.journey_id, flightNo: r.flight_no || '', airline: r.airline || '',
    dep: { iata: r.dep_iata || '', name: r.dep_name || '', cc: r.dep_cc || '', tz: r.dep_tz || '', time: r.dep_time || '', terminal: r.dep_terminal || '', gate: r.dep_gate || '' },
    arr: { iata: r.arr_iata || '', name: r.arr_name || '', cc: r.arr_cc || '', tz: r.arr_tz || '', time: r.arr_time || '', terminal: r.arr_terminal || '', baggage: r.arr_baggage || '' },
    aircraft: r.aircraft || '', status: r.status || '', passengers: arr(r.passengers), memo: r.memo || '', fetchedAt: r.fetched_at || '' };
}
const flightToRow = f => ({ id: f.id, journey_id: f.journeyId, flight_no: f.flightNo, airline: f.airline,
  dep_iata: f.dep.iata, dep_name: f.dep.name, dep_cc: f.dep.cc, dep_tz: f.dep.tz, dep_time: f.dep.time, dep_terminal: f.dep.terminal, dep_gate: f.dep.gate,
  arr_iata: f.arr.iata, arr_name: f.arr.name, arr_cc: f.arr.cc, arr_tz: f.arr.tz, arr_time: f.arr.time, arr_terminal: f.arr.terminal, arr_baggage: f.arr.baggage || '',
  aircraft: f.aircraft, status: f.status, passengers: f.passengers, memo: f.memo, fetched_at: f.fetchedAt || null });
function rowToStay(r) {
  return { id: String(r.id), journeyId: r.journey_id, name: r.name || '', localName: r.local_name || '', address: r.address || '',
    localAddress: r.local_address || '', phone: r.phone || '', googlePlaceId: r.google_place_id || '',
    lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng),
    checkIn: String(r.check_in || '').slice(0, 10), checkOut: String(r.check_out || '').slice(0, 10), checkInTime: r.check_in_time || '',
    guests: arr(r.guests), memo: r.memo || '' };
}
const stayToRow = s => ({ id: s.id, journey_id: s.journeyId, name: s.name, local_name: s.localName || '', address: s.address || '',
  local_address: s.localAddress || '', phone: s.phone || '', google_place_id: s.googlePlaceId || null, lat: s.lat, lng: s.lng,
  check_in: s.checkIn, check_out: s.checkOut, check_in_time: s.checkInTime || '', guests: s.guests, memo: s.memo || '' });

const flightsOf = jid => (DATA.flights || []).filter(f => f.journeyId === jid);
const staysOf = jid => (DATA.stays || []).filter(s => s.journeyId === jid).sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.checkOut < b.checkOut ? -1 : 1));
const sideTz = s => s.tz || (AIRPORT_BY[s.iata] || {}).tz || '';
const sideCc = s => s.cc || (AIRPORT_BY[s.iata] || {}).cc || '';
const sideName = s => (AIRPORT_BY[s.iata] && AIRPORT_BY[s.iata].city !== AIRPORT_BY[s.iata].name ? `${AIRPORT_BY[s.iata].city} ${AIRPORT_BY[s.iata].name}` : (AIRPORT_BY[s.iata] || {}).name) || s.name || '';
const depUtc = f => localToUtc(f.dep.time, sideTz(f.dep));
const arrUtc = f => localToUtc(f.arr.time, sideTz(f.arr));
const flightMinutes = f => { const d = depUtc(f), a = arrUtc(f); return d != null && a != null ? Math.round((a - d) / 60000) : null; };

/** 구간들 → 여정(가는 편 / 오는 편 / 이동). 다음 구간이 24시간 안에 이어지면 경유로 한 여정 */
function flightLegs(list) {
  const segs = list.slice().sort((a, b) => {
    const x = depUtc(a), y = depUtc(b);
    return x != null && y != null ? x - y : (a.dep.time < b.dep.time ? -1 : 1);
  });
  const legs = [];
  segs.forEach(f => {
    const leg = legs[legs.length - 1];
    const prev = leg && leg.segs[leg.segs.length - 1];
    let gap = null;
    if (prev) {
      const a = arrUtc(prev), d = depUtc(f);
      gap = a != null && d != null ? Math.round((d - a) / 60000) : null;
    }
    const connects = prev && (gap != null ? gap >= 0 && gap <= 24 * 60 : prev.arr.iata && prev.arr.iata === f.dep.iata && dayDiff(prev.arr.time || prev.dep.time, f.dep.time) <= 1);
    if (connects) { leg.layovers.push(gap); leg.segs.push(f); } else legs.push({ segs: [f], layovers: [] });
  });
  legs.forEach(l => {
    const first = l.segs[0], last = l.segs[l.segs.length - 1];
    l.kind = sideCc(first.dep) === 'KR' ? 'out' : sideCc(last.arr) === 'KR' ? 'back' : 'move';
  });
  return legs;
}
const LEG_NAME = { out: '🛫 가는 편', back: '🛬 오는 편', move: '✈️ 이동' };
const STATUS_KO = { Scheduled: '예정', Expected: '예정', EnRoute: '비행 중', CheckIn: '체크인 중', Boarding: '탑승 중', GateClosed: '탑승 마감',
  Departed: '출발함', Delayed: '지연', Approaching: '도착 임박', Arrived: '도착함', Canceled: '결항', Diverted: '회항', CanceledUncertain: '결항 가능성' };
const statusLink = f => `https://www.google.com/search?q=${encodeURIComponent(f.flightNo + ' flight status')}`;

/* ───────── 개요 카드 ───────── */
function travelCards(i) {
  if (DATA.noStep5) return `<div class="card privacy" style="background:#fff4c2;color:#6b4e00">⚠️ 항공편·숙소를 쓰려면 Supabase SQL Editor에서 <b>schema.sql</b>을 다시 실행해 주세요.</div>`;
  return flightCard(i) + stayCard(i);
}

function segHtml(f, i) {
  const mins = flightMinutes(f);
  const plus = f.arr.time && f.dep.time ? dayDiff(f.dep.time, f.arr.time) : 0;
  const pax = f.passengers.length && f.passengers.length < i.people.length ? f.passengers.join(', ') : '';
  const daysToGo = f.dep.time ? dayDiff(todayIso(), f.dep.time) : 99;
  const st = f.status && !/^예정/.test(f.status) ? f.status : '';
  const meta = [
    f.dep.gate && `<b>게이트 ${esc(f.dep.gate)}</b>`, f.arr.baggage && `수하물 벨트 ${esc(f.arr.baggage)}`,
    pax && `탑승 ${esc(pax)}`, f.memo && esc(f.memo),
  ].filter(Boolean).join(' · ');
  return `<div class="fseg" data-flight="${esc(f.id)}">
    <div class="fhead"><b>${esc(f.flightNo || '항공편')}</b> <span class="note">${esc([f.airline, f.aircraft].filter(Boolean).join(' · '))}</span>
      ${st ? `<span class="tag ${/지연|결항|회항/.test(st) ? 'warn' : 'now'}">${esc(st)}</span>` : ''}</div>
    <div class="froute">
      <div class="fend"><div class="ftime">${hm(f.dep.time) || '--:--'}</div><div class="fcode">${esc(f.dep.iata || '???')}</div>
        <div class="fname">${esc(sideName(f.dep))}${f.dep.terminal ? ` <b>T${esc(String(f.dep.terminal).replace(/^T/i, ''))}</b>` : ''}</div></div>
      <div class="fmid"><span>${fmtDur(mins)}</span><i></i></div>
      <div class="fend r"><div class="ftime">${hm(f.arr.time) || '--:--'}${plus > 0 ? `<sup>+${plus}</sup>` : ''}</div><div class="fcode">${esc(f.arr.iata || '???')}</div>
        <div class="fname">${esc(sideName(f.arr))}${f.arr.terminal ? ` <b>T${esc(String(f.arr.terminal).replace(/^T/i, ''))}</b>` : ''}</div></div>
    </div>
    ${meta ? `<div class="fmeta">${meta}</div>` : ''}
    <div class="fact">
      ${f.flightNo ? `<a class="btn ghost small" href="${statusLink(f)}" target="_blank" rel="noopener">실시간 보기</a>` : ''}
      ${f.flightNo && daysToGo <= 2 && daysToGo >= -1 ? `<button class="btn ghost small" data-frefresh="${esc(f.id)}" title="게이트·지연 정보 새로 불러오기">🔄 게이트·지연</button>` : ''}
      <button class="btn ghost small" data-fedit="${esc(f.id)}">수정</button>
    </div>
  </div>`;
}

function flightCard(i) {
  const list = flightsOf(i.journey.id);
  const legs = flightLegs(list);
  const hasBack = legs.some(l => l.kind === 'back');
  return `<div class="card">
    <div class="chead"><h3 class="ch">✈️ 항공편</h3><button class="btn small" id="fAdd">＋ 추가</button></div>
    ${legs.map(l => `<div class="leg">
      <div class="leghead">${LEG_NAME[l.kind]} <span class="note">${mdw(l.segs[0].dep.time)}${l.segs.length > 1 ? ` · 경유 ${l.segs.length - 1}회` : ''}</span></div>
      ${l.segs.map((f, n) => (n ? `<div class="layover">⏱ ${esc(sideName(f.dep) || f.dep.iata)}에서 ${l.layovers[n - 1] != null ? fmtDur(l.layovers[n - 1]) + ' ' : ''}환승</div>` : '') + segHtml(f, i)).join('')}
    </div>`).join('') || '<div class="note">날짜와 편명만 넣으면 시간·공항·터미널을 불러와요. 편도·왕복·경유 모두 구간별로 넣으면 돼요.</div>'}
    ${legs.length && !hasBack ? '<div class="actions"><button class="btn ghost small" id="fBack">＋ 오는 편 추가</button></div>' : ''}
  </div>`;
}

/** 숙소가 없는 밤 (여행 첫날 ~ 마지막 날 전날). 밤새 비행하는 날은 빼고 */
function stayGaps(i, stays) {
  if (!stays.length || !i.dep || !i.ret || i.ret <= i.dep) return [];
  const flights = flightsOf(i.journey.id);
  const out = [];
  for (let d = i.dep, n = 0; d < i.ret && n < 366; d = addDays(d, 1), n++) {
    const covered = stays.some(s => s.checkIn <= d && d < s.checkOut);
    const overnight = flights.some(f => f.dep.time.slice(0, 10) === d && f.arr.time && f.arr.time.slice(0, 10) > d);
    if (!covered && !overnight) out.push(d);
  }
  return out;
}
const nightsOf = s => Math.max(0, dayDiff(s.checkIn, s.checkOut));
const dirLink = s => s.lat != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}${s.googlePlaceId ? '&destination_place_id=' + encodeURIComponent(s.googlePlaceId) : ''}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.name + ' ' + s.address)}`;

function stayHtml(s, i) {
  const who = s.guests.length && s.guests.length < i.people.length ? s.guests.join(', ') : '';
  const today = todayIso();
  const tonight = s.checkIn <= today && today < s.checkOut;
  return `<div class="stay ${tonight ? 'tonight' : ''}" data-stay="${esc(s.id)}">
    <div class="sdates">${mdw(s.checkIn)} ~ ${mdw(s.checkOut)} · <b>${nightsOf(s)}박</b>${tonight ? ' <span class="tag now">오늘 밤</span>' : ''}</div>
    <div class="sname">🏨 ${esc(s.name)}</div>
    <div class="who">${esc([s.address, s.checkInTime && '체크인 ' + s.checkInTime, who && '묵는 사람 ' + who].filter(Boolean).join(' · '))}</div>
    ${s.memo ? `<div class="memo">${esc(s.memo)}</div>` : ''}
    <div class="fact">
      <a class="btn ghost small" href="${dirLink(s)}" target="_blank" rel="noopener">🧭 길찾기</a>
      <button class="btn ghost small" data-taxi="${esc(s.id)}">🚕 택시에 보여주기</button>
      ${s.phone ? `<a class="btn ghost small" href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">📞</a>` : ''}
      <button class="btn ghost small" data-sspend="${esc(s.id)}" title="숙박비 기록">＋💰</button>
      <button class="btn ghost small" data-sedit="${esc(s.id)}">수정</button>
    </div>
  </div>`;
}

function stayCard(i) {
  const stays = staysOf(i.journey.id);
  const nights = stays.reduce((n, s) => n + nightsOf(s), 0);
  const gaps = stayGaps(i, stays);
  return `<div class="card">
    <div class="chead"><h3 class="ch">🏨 숙소 ${stays.length ? `<span class="note">${stays.length}곳 · ${nights}박</span>` : ''}</h3><button class="btn small" id="sAdd">＋ 추가</button></div>
    ${stays.map(s => stayHtml(s, i)).join('') || '<div class="note">구글에서 찾아 등록해요. 여행 중에 숙소를 옮기면 여러 곳 넣으면 돼요.</div>'}
    ${gaps.length ? `<div class="gapwarn">⚠️ 숙소가 비어 있는 밤: ${gaps.map(mdw).join(', ')}</div>` : ''}
  </div>`;
}

function wireTravelCards(i) {
  if (DATA.noStep5) return;
  const body = $('jBody');
  $('fAdd').onclick = () => { editingFlight = newFlight(i); renderJourney(); };
  if ($('fBack')) $('fBack').onclick = () => {
    const legs = flightLegs(flightsOf(i.journey.id));
    const first = legs[0].segs[0], lastLeg = legs[legs.length - 1], last = lastLeg.segs[lastLeg.segs.length - 1];
    editingFlight = newFlight(i, { date: i.ret || '', dep: Object.assign({}, last.arr, { time: '', terminal: '', gate: '' }),
      arr: Object.assign({}, first.dep, { time: '', terminal: '', gate: '', baggage: '' }) });
    renderJourney();
  };
  body.querySelectorAll('[data-fedit]').forEach(b => b.onclick = () => {
    const f = flightsOf(i.journey.id).find(x => x.id === b.dataset.fedit);
    editingFlight = Object.assign(JSON.parse(JSON.stringify(f)), { date: f.dep.time.slice(0, 10) }); renderJourney();
  });
  body.querySelectorAll('[data-frefresh]').forEach(b => b.onclick = async () => {
    const f = flightsOf(i.journey.id).find(x => x.id === b.dataset.frefresh);
    b.disabled = true; b.textContent = '불러오는 중…';
    try {
      const found = await lookupFlight(f.flightNo, f.dep.time.slice(0, 10), true);
      const hit = found.find(r => r.dep.iata === f.dep.iata) || (found.length === 1 ? found[0] : null);
      if (!hit) { toast('새 정보를 찾지 못했어요'); renderJourney(); return; }
      applyLookup(f, hit);
      saveRows('flights', [flightToRow(f)]); afterLocalChange();
      toast(hit.dep.gate ? `게이트 ${hit.dep.gate} · ${f.status || '정보 갱신'}` : '아직 게이트가 정해지지 않았어요 (보통 출발 몇 시간 전)');
    } catch (e) { toast(e.message); renderJourney(); }
  });
  $('sAdd').onclick = () => { editingStay = newStay(i); renderJourney(); };
  body.querySelectorAll('[data-sedit]').forEach(b => b.onclick = () => {
    editingStay = Object.assign({}, staysOf(i.journey.id).find(x => x.id === b.dataset.sedit)); renderJourney();
  });
  body.querySelectorAll('[data-taxi]').forEach(b => b.onclick = () => showTaxiCard(staysOf(i.journey.id).find(x => x.id === b.dataset.taxi)));
  body.querySelectorAll('[data-sspend]').forEach(b => b.onclick = () => {
    const s = staysOf(i.journey.id).find(x => x.id === b.dataset.sspend);
    editingExpense = newExpense(i, { title: s.name, category: 'stay', paidOn: todayIso() < i.dep ? todayIso() : s.checkIn });
    editingExpense.currency = currencyForDate(i, editingExpense.paidOn);
    journeySub = 'money'; renderJourney();
  });
}

/** 🚕 택시 기사님께 보여주기: 현지어 이름·주소를 크게 */
function showTaxiCard(s) {
  if (!s) return;
  const box = document.createElement('div');
  box.className = 'taxi';
  box.innerHTML = `<div class="taxiin">
    <div class="note">${esc(s.name)}</div>
    <div class="tbig">${esc(s.localName || s.name)}</div>
    <div class="taddr">${esc(s.localAddress || s.address)}</div>
    ${s.phone ? `<div class="taddr">☎ ${esc(s.phone)}</div>` : ''}
    <div class="actions" style="justify-content:center"><a class="btn" href="${dirLink(s)}" target="_blank" rel="noopener">🧭 지도</a><button class="btn ghost" id="taxiClose">닫기</button></div>
  </div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.querySelector('#taxiClose').onclick = close;
  box.onclick = e => { if (e.target === box) close(); };
}

/* ───────── ✈️ 항공편 입력 ───────── */
function defaultPassengers(i, date) {
  const exact = i.members.filter(t => t.dep === date || t.ret === date).map(t => t.person);
  return exact.length && exact.length < i.people.length ? [...new Set(exact)] : [];
}
function newFlight(i, extra) {
  const f = Object.assign({ id: newId(), journeyId: i.journey.id, isNew: true, date: i.dep || todayIso(), flightNo: '', airline: '',
    dep: { iata: '', name: '', cc: '', tz: '', time: '', terminal: '', gate: '' },
    arr: { iata: '', name: '', cc: '', tz: '', time: '', terminal: '', baggage: '' },
    aircraft: '', status: '', passengers: null, memo: '', fetchedAt: '' }, extra || {});
  if (!f.passengers) f.passengers = defaultPassengers(i, f.date);
  return f;
}

/** Edge Function 호출. 함수가 아직 없으면 알기 쉬운 말로 */
async function lookupFlight(flightNo, date, fresh) {
  const url = CFG.supabaseUrl.replace(/\/+$/, '') + '/functions/v1/flight-lookup';
  const headers = { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' };
  if (!/^sb_/.test(CFG.supabaseKey)) headers.Authorization = 'Bearer ' + CFG.supabaseKey;
  let res, body = null;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ flight: flightNo, date, fresh: !!fresh }) });
    try { body = await res.json(); } catch (e) {}
  } catch (e) { throw new Error('항공편 자동 불러오기에 연결하지 못했어요. 직접 입력해 주세요'); }
  if (res.status === 404 && !(body && body.error)) throw new Error('항공편 자동 불러오기가 아직 설정 전이에요 (README 참고). 직접 입력해 주세요');
  if (res.status === 401) throw new Error('항공편 자동 불러오기 설정에서 "Verify JWT"를 꺼 주세요. 지금은 직접 입력해 주세요');
  if (!res.ok || !body || !body.ok) throw new Error((body && body.error) || `항공편을 불러오지 못했어요 (${res.status})`);
  if (body.note) toast(body.note);
  return body.flights || [];
}
/** 불러온 정보로 칸 채우기 (탑승자·메모는 사람이 정한 그대로) */
function applyLookup(f, r) {
  f.flightNo = r.flightNo || f.flightNo; f.airline = r.airline || f.airline; f.aircraft = r.aircraft || f.aircraft;
  const st = STATUS_KO[r.status] || '';
  const late = r.dep.revised && r.dep.revised !== r.dep.time ? ` · 예상 출발 ${hm(r.dep.revised)}` : '';
  f.status = st + late;
  ['dep', 'arr'].forEach(k => {
    const s = r[k], t = f[k];
    t.iata = s.iata || t.iata; t.name = s.name || t.name; t.cc = s.cc || t.cc; t.tz = s.tz || t.tz;
    t.time = s.time || t.time; t.terminal = s.terminal || t.terminal;
    if (k === 'dep') t.gate = s.gate || t.gate; else t.baggage = s.baggage || t.baggage;
  });
  f.date = f.dep.time.slice(0, 10) || f.date;
  f.fetchedAt = new Date().toISOString();
}
/** 공항 칸: 'ICN', 'ICN · 인천 (서울)', '인천', '다낭' 모두 받음 */
function parseAirport(text, keep) {
  const t = String(text || '').trim();
  if (!t) return { iata: '', name: '', cc: '', tz: '' };
  const code = (t.match(/^[A-Za-z]{3}\b/) || [''])[0].toUpperCase();
  const hit = AIRPORT_BY[code] || (window.AIRPORTS || []).find(a => t.includes(a.name) || t.includes(a.city));
  if (hit) return keep && keep.iata === hit.iata ? Object.assign({}, keep) : { iata: hit.iata, name: hit.name, cc: hit.cc, tz: hit.tz };
  if (code) return keep && keep.iata === code ? Object.assign({}, keep) : { iata: code, name: '', cc: '', tz: '' };
  return { iata: '', name: t, cc: '', tz: '' };
}
const airportText = s => s.iata ? `${s.iata}${AIRPORT_BY[s.iata] ? ` · ${AIRPORT_BY[s.iata].name} (${AIRPORT_BY[s.iata].city})` : s.name ? ` · ${s.name}` : ''}` : s.name || '';

function renderFlightForm(i) {
  const f = editingFlight;
  const ppl = i.people;
  $('jBody').innerHTML = `
    <div class="card">
      <h3 class="ch">${f.isNew ? '✈️ 항공편 추가' : '✈️ 항공편 수정'}</h3>
      <div class="row2">
        <div><label>출발 날짜 (현지)</label><input type="date" id="fDate" value="${esc(f.date)}"></div>
        <div><label>편명</label><input type="text" id="fNo" value="${esc(f.flightNo)}" placeholder="예: KE461" autocapitalize="characters" autocomplete="off"></div>
      </div>
      <div class="actions"><button class="btn" id="fLookup">🔍 날짜·편명으로 불러오기</button></div>
      <div class="note" id="fLookupMsg">불러오면 시간·공항·터미널이 채워져요. 안 되면 아래에 직접 넣어도 돼요.</div>
      ${flightChoices ? `<div class="choices"><div class="note">구간이 여러 개예요. 탈 구간을 골라 주세요</div>
        ${flightChoices.map((r, n) => `<button class="btn ghost" data-choice="${n}">${esc(r.dep.iata)} ${hm(r.dep.time)} → ${esc(r.arr.iata)} ${hm(r.arr.time)}</button>`).join('')}</div>` : ''}
      <div class="fform">
        <div class="fside"><b>출발</b>
          <input type="text" id="fDepAp" list="airportList" value="${esc(airportText(f.dep))}" placeholder="공항 (예: ICN, 인천)">
          <div class="row2"><input type="time" id="fDepTime" value="${esc(hm(f.dep.time))}" aria-label="출발 시각"><input type="text" id="fDepTerm" value="${esc(f.dep.terminal)}" placeholder="터미널 (예: 2)"></div>
          <input type="text" id="fGate" value="${esc(f.dep.gate)}" placeholder="게이트 (당일에 정해져요)">
        </div>
        <div class="fside"><b>도착</b>
          <input type="text" id="fArrAp" list="airportList" value="${esc(airportText(f.arr))}" placeholder="공항 (예: DAD, 다낭)">
          <div class="row2"><input type="date" id="fArrDate" value="${esc(f.arr.time.slice(0, 10) || f.date)}" aria-label="도착 날짜"><input type="time" id="fArrTime" value="${esc(hm(f.arr.time))}" aria-label="도착 시각"></div>
          <input type="text" id="fArrTerm" value="${esc(f.arr.terminal)}" placeholder="터미널">
        </div>
      </div>
      <div class="note" id="fDurNote"></div>
      <label>탄 사람 <span class="note">(아무도 안 고르면 일행 전체)</span></label>
      <div class="filters" id="fPax">${ppl.map(p => `<button class="pill ${f.passengers.includes(p) ? 'on' : ''}" data-pax="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <label>메모</label><input type="text" id="fMemo" value="${esc(f.memo)}" placeholder="예: 좌석 32A·32B, 수하물 23kg (예약번호는 적지 마세요)">
      <div class="actions">
        <button class="btn" id="fSave">저장</button>
        <button class="btn ghost" id="fCancel">취소</button>
        ${f.isNew ? '' : '<button class="btn danger" id="fDel">삭제</button>'}
      </div>
    </div>`;
  const read = () => {
    f.date = $('fDate').value; f.flightNo = $('fNo').value.toUpperCase().replace(/\s+/g, '');
    f.dep = Object.assign(parseAirport($('fDepAp').value, f.dep), { time: f.date && $('fDepTime').value ? f.date + 'T' + $('fDepTime').value : '', terminal: $('fDepTerm').value.trim(), gate: $('fGate').value.trim() });
    const ad = $('fArrDate').value || f.date;
    f.arr = Object.assign(parseAirport($('fArrAp').value, f.arr), { time: ad && $('fArrTime').value ? ad + 'T' + $('fArrTime').value : '', terminal: $('fArrTerm').value.trim(), baggage: f.arr.baggage || '' });
    f.memo = $('fMemo').value.trim();
  };
  const showDur = () => {
    read();
    const m = flightMinutes(f);
    $('fDurNote').textContent = m != null ? `비행시간 ${fmtDur(m)}` + (m < 0 ? ' ⚠️ 도착이 출발보다 빨라요. 날짜를 확인해 주세요' : '') : '';
  };
  ['fDepTime', 'fArrTime', 'fArrDate', 'fDepAp', 'fArrAp'].forEach(id => $(id).addEventListener('change', showDur));
  showDur();
  $('fDate').addEventListener('change', () => { if (!$('fArrDate').value || $('fArrDate').value < $('fDate').value) $('fArrDate').value = $('fDate').value; });
  $('fPax').querySelectorAll('[data-pax]').forEach(b => b.onclick = () => {
    read(); const p = b.dataset.pax;
    f.passengers = f.passengers.includes(p) ? f.passengers.filter(x => x !== p) : f.passengers.concat(p);
    renderFlightForm(i);
  });
  $('fLookup').onclick = async () => {
    read();
    if (!f.date || !f.flightNo) return toast('출발 날짜와 편명을 넣어 주세요');
    $('fLookup').disabled = true; $('fLookupMsg').textContent = '찾는 중…';
    try {
      const found = await lookupFlight(f.flightNo, f.date);
      if (!found.length) { $('fLookupMsg').textContent = '이 날짜에 그 편명을 찾지 못했어요. 날짜(현지 출발일)·편명을 확인하거나 직접 넣어 주세요.'; $('fLookup').disabled = false; return; }
      const mine = f.dep.iata ? found.filter(r => r.dep.iata === f.dep.iata) : [];
      if (found.length > 1 && mine.length !== 1) { flightChoices = found; renderFlightForm(i); return; }
      applyLookup(f, mine[0] || found[0]); flightChoices = null;
      renderFlightForm(i); toast('불러왔어요 ✈️ 맞는지 확인하고 저장해 주세요');
    } catch (e) { $('fLookupMsg').textContent = e.message; $('fLookup').disabled = false; }
  };
  $('jBody').querySelectorAll('[data-choice]').forEach(b => b.onclick = () => {
    applyLookup(f, flightChoices[Number(b.dataset.choice)]); flightChoices = null; renderFlightForm(i);
  });
  $('fCancel').onclick = () => { editingFlight = null; flightChoices = null; renderJourney(); };
  if ($('fDel')) $('fDel').onclick = () => {
    const orig = flightsOf(i.journey.id).find(x => x.id === f.id);
    if (!orig || !confirm(`${orig.flightNo || '이 항공편'}을 삭제할까요?`)) return;
    trashFlight(orig);
    editingFlight = null; afterLocalChange(); toast(DATA.noStep4 ? '삭제했어요' : '휴지통으로 옮겼어요');
  };
  $('fSave').onclick = () => {
    read();
    if (!f.date || !f.dep.time) return toast('출발 날짜와 시각을 넣어 주세요');
    if (!f.flightNo && !(f.dep.iata && f.arr.iata)) return toast('편명이나 출발·도착 공항을 넣어 주세요');
    if (f.arr.time && f.arr.time < f.dep.time && dayDiff(f.dep.time, f.arr.time) < 0) return toast('도착 날짜가 출발보다 빨라요');
    const m = flightMinutes(f);
    if (m != null && m < 0) return toast('도착이 출발보다 빨라요. 도착 날짜를 확인해 주세요');
    const saved = JSON.parse(JSON.stringify(f));
    delete saved.isNew; delete saved.date;
    DATA.flights = (DATA.flights || []).filter(x => x.id !== saved.id).concat(saved);
    saveRows('flights', [flightToRow(saved)]);
    editingFlight = null; flightChoices = null; afterLocalChange(); toast('저장했어요 ✈️');
  };
}

/* ───────── 🏨 숙소 입력 ───────── */
// 나라 → 현지 말 (택시 기사님께 보여줄 이름·주소)
const LANG_BY_CC = { JP: 'ja', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK', MO: 'zh-HK', VN: 'vi', TH: 'th', KH: 'km', LA: 'lo', MM: 'my', ID: 'id',
  MY: 'ms', MN: 'mn', ES: 'es', MX: 'es', AR: 'es', CL: 'es', PE: 'es', IT: 'it', FR: 'fr', DE: 'de', AT: 'de', CH: 'de', PT: 'pt', BR: 'pt',
  NL: 'nl', GR: 'el', TR: 'tr', CZ: 'cs', HU: 'hu', PL: 'pl', HR: 'hr', RU: 'ru', AE: 'ar', EG: 'ar', MA: 'fr', IL: 'he', DK: 'da', SE: 'sv',
  NO: 'no', FI: 'fi', IS: 'is', SI: 'sl' };

function newStay(i) {
  const prev = staysOf(i.journey.id);
  const start = prev.length ? prev[prev.length - 1].checkOut : (i.dep || todayIso());
  const end = i.ret && i.ret > start ? i.ret : addDays(start, 1);
  return { id: newId(), journeyId: i.journey.id, isNew: true, name: '', localName: '', address: '', localAddress: '', phone: '',
    googlePlaceId: '', lat: null, lng: null, checkIn: start, checkOut: end, checkInTime: '', guests: [], memo: '' };
}

async function fillStayFromGoogle(place) {
  const s = editingStay;
  await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'internationalPhoneNumber', 'addressComponents'] });
  s.name = place.displayName || s.name; s.address = place.formattedAddress || ''; s.googlePlaceId = place.id || '';
  s.phone = place.internationalPhoneNumber || s.phone;
  if (place.location) { s.lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat; s.lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng; }
  const country = (place.addressComponents || []).find(c => (c.types || []).includes('country'));
  const lang = country && LANG_BY_CC[country.shortText || country.short_name];
  s.localName = ''; s.localAddress = '';
  if (lang && place.id) {
    try {
      const { Place } = await google.maps.importLibrary('places');
      const lp = new Place({ id: place.id, requestedLanguage: lang });
      await lp.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      s.localName = lp.displayName || ''; s.localAddress = lp.formattedAddress || '';
    } catch (e) { /* 현지어가 없으면 한국어 그대로 보여 줌 */ }
  }
}

function renderStayForm(i) {
  const s = editingStay;
  $('jBody').innerHTML = `
    <div class="card">
      <h3 class="ch">${s.isNew ? '🏨 숙소 추가' : '🏨 숙소 수정'}</h3>
      ${CFG.googleMapsKey ? `<label>구글에서 찾기</label><div id="sSearch" class="psearch"><span class="note">검색창 불러오는 중…</span></div>` : ''}
      <label>이름</label><input type="text" id="sName" value="${esc(s.name)}" placeholder="예: 풀만 다낭 비치 리조트">
      ${s.address ? `<div class="note">📍 ${esc(s.address)}</div>` : ''}
      ${s.localName || s.localAddress ? `<div class="note">🚕 ${esc(s.localName)} · ${esc(s.localAddress)}</div>` : ''}
      <div class="row2">
        <div><label>체크인</label><input type="date" id="sIn" value="${esc(s.checkIn)}"></div>
        <div><label>체크아웃</label><input type="date" id="sOut" value="${esc(s.checkOut)}" min="${esc(s.checkIn)}"></div>
      </div>
      <div class="note" id="sNights"></div>
      <div class="row2">
        <div><label>체크인 시각</label><input type="time" id="sTime" value="${esc(s.checkInTime)}"></div>
        <div><label>전화</label><input type="tel" id="sPhone" value="${esc(s.phone)}"></div>
      </div>
      <label>묵는 사람 <span class="note">(아무도 안 고르면 일행 전체)</span></label>
      <div class="filters" id="sGuests">${i.people.map(p => `<button class="pill ${s.guests.includes(p) ? 'on' : ''}" data-guestp="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <label>메모</label><input type="text" id="sMemo" value="${esc(s.memo)}" placeholder="예: 조식 포함, 아고다 결제, 수영장 7~19시">
      <div class="actions">
        <button class="btn" id="sSave">저장</button>
        <button class="btn ghost" id="sCancel">취소</button>
        ${s.isNew ? '' : '<button class="btn danger" id="sDel">삭제</button>'}
      </div>
    </div>`;
  const read = () => { s.name = $('sName').value.trim(); s.checkIn = $('sIn').value; s.checkOut = $('sOut').value; s.checkInTime = $('sTime').value; s.phone = $('sPhone').value.trim(); s.memo = $('sMemo').value.trim(); };
  const showNights = () => { read(); $('sNights').textContent = s.checkIn && s.checkOut ? (s.checkOut >= s.checkIn ? `${nightsOf(s)}박` : '⚠️ 체크아웃이 체크인보다 빨라요') : ''; };
  $('sIn').addEventListener('change', () => { $('sOut').min = $('sIn').value; if (!$('sOut').value || $('sOut').value <= $('sIn').value) $('sOut').value = addDays($('sIn').value, 1); showNights(); });
  $('sOut').addEventListener('change', showNights);
  showNights();
  $('sGuests').querySelectorAll('[data-guestp]').forEach(b => b.onclick = () => {
    read(); const p = b.dataset.guestp;
    s.guests = s.guests.includes(p) ? s.guests.filter(x => x !== p) : s.guests.concat(p);
    renderStayForm(i);
  });
  $('sCancel').onclick = () => { editingStay = null; renderJourney(); };
  if ($('sDel')) $('sDel').onclick = () => {
    const orig = staysOf(i.journey.id).find(x => x.id === s.id);
    if (!orig || !confirm(`${orig.name}을(를) 삭제할까요?`)) return;
    trashStay(orig);
    editingStay = null; afterLocalChange(); toast(DATA.noStep4 ? '삭제했어요' : '휴지통으로 옮겼어요');
  };
  $('sSave').onclick = () => {
    read();
    if (!s.name) return toast('숙소 이름을 넣어 주세요');
    if (!s.checkIn || !s.checkOut) return toast('체크인·체크아웃 날짜를 넣어 주세요');
    if (s.checkOut < s.checkIn) return toast('체크아웃이 체크인보다 빨라요');
    const saved = Object.assign({}, s); delete saved.isNew;
    DATA.stays = (DATA.stays || []).filter(x => x.id !== saved.id).concat(saved);
    saveRows('stays', [stayToRow(saved)]);
    editingStay = null; afterLocalChange(); toast('저장했어요 🏨');
  };
  if (CFG.googleMapsKey) mountStaySearch(i, read);
}

async function mountStaySearch(i, read) {
  const box = $('sSearch');
  try {
    await loadGoogleMaps();
    const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
    if (!$('sSearch')) return;
    const codes = i.countries.map(c => c.code).filter(c => /^[A-Z]{2}$/.test(c)).slice(0, 15).map(c => c.toLowerCase());
    const opts = codes.length ? { includedRegionCodes: codes } : {};
    let el;
    try { el = new PlaceAutocompleteElement(Object.assign({ includedPrimaryTypes: ['lodging'] }, opts)); } catch (e) { el = new PlaceAutocompleteElement(opts); }
    box.innerHTML = ''; box.appendChild(el);
    const pick = async place => { read(); await fillStayFromGoogle(place); renderStayForm(i); };
    el.addEventListener('gmp-select', async ev => pick(ev.placePrediction.toPlace()));
    el.addEventListener('gmp-placeselect', async ev => pick(ev.place));
  } catch (e) { if (box) box.innerHTML = `<span class="note">${esc(e.message || '검색을 쓸 수 없어요')} · 이름을 직접 써 주세요</span>`; }
}

/* ───────── 📍 일정 탭 맨 위: 그날 항공편·오늘 밤 숙소 ───────── */
function dayTravelBanner(i, date) {
  if (!date || DATA.noStep5) return '';
  const fl = flightsOf(i.journey.id).filter(f => f.dep.time.slice(0, 10) === date || f.arr.time.slice(0, 10) === date)
    .sort((a, b) => (a.dep.time < b.dep.time ? -1 : 1));
  const stays = staysOf(i.journey.id);
  const tonight = stays.find(s => s.checkIn <= date && date < s.checkOut);
  const leaving = stays.find(s => s.checkOut === date && s !== tonight);
  if (!fl.length && !tonight && !leaving) return '';
  return `<div class="card daybanner">
    <div class="note" style="margin-top:0">${mdw(date)}${date === todayIso() ? ' · 오늘' : ''}</div>
    ${fl.map(f => `<div class="bline">✈️ <b>${esc(f.flightNo)}</b> ${hm(f.dep.time)} ${esc(f.dep.iata)}${f.dep.terminal ? ' T' + esc(String(f.dep.terminal).replace(/^T/i, '')) : ''} → ${hm(f.arr.time)} ${esc(f.arr.iata)}${f.dep.gate ? ` · <b>게이트 ${esc(f.dep.gate)}</b>` : ''}</div>`).join('')}
    ${leaving ? `<div class="bline">🧳 체크아웃: ${esc(leaving.name)}</div>` : ''}
    ${tonight ? `<div class="bline">🏨 오늘 밤: <b>${esc(tonight.name)}</b></div>
      <div class="fact"><a class="btn ghost small" href="${dirLink(tonight)}" target="_blank" rel="noopener">🧭 길찾기</a>
      <button class="btn ghost small" data-taxi="${esc(tonight.id)}">🚕 택시에 보여주기</button></div>` : ''}
  </div>`;
}
function wireDayBanner(i) {
  $('jBody').querySelectorAll('.daybanner [data-taxi]').forEach(b => b.onclick = () => showTaxiCard(staysOf(i.journey.id).find(x => x.id === b.dataset.taxi)));
}

/** 통계 맨 위 '다가오는 여행' 줄에 붙일 첫 항공편 */
function nextFlightLine(jid) {
  if (!jid || !DATA.flights) return '';
  const now = Date.now();
  const list = flightsOf(jid).filter(f => f.dep.time).sort((a, b) => (a.dep.time < b.dep.time ? -1 : 1));
  const f = list.find(x => { const u = arrUtc(x) || depUtc(x); return u == null ? x.dep.time.slice(0, 10) >= todayIso() : u > now; });
  if (!f) return '';
  return `<div class="who">✈️ ${esc(f.flightNo)} ${mdw(f.dep.time)} ${hm(f.dep.time)} ${esc(f.dep.iata)}${f.dep.terminal ? ' T' + esc(String(f.dep.terminal).replace(/^T/i, '')) : ''}${f.dep.gate ? ' · 게이트 ' + esc(f.dep.gate) : ''}</div>`;
}

/* 공항 자동완성 목록 (한 번만) */
(function () {
  const dl = document.createElement('datalist');
  dl.id = 'airportList';
  dl.innerHTML = (window.AIRPORTS || []).map(a => `<option value="${a.iata} · ${a.name} (${a.city})">`).join('');
  document.body.appendChild(dl);
})();
