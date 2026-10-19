/**
 * 같이 간 여행(묶음) · 가계부 · 장소(구글지도) · 정산
 *
 * - 여행 묶음(journeys): 일행마다 출국·입국일이 달라도 하나의 여행. 기간·나라는 일행 기록(trips)에서 계산
 * - 가계부(expenses): 현지화폐 + 원화. 환율은 결제일 기준 자동(수정 가능), 카드 청구 원화로 덮어쓰기 가능
 * - 장소(places): 구글 장소 검색으로 기록, 여행 지도에 핀
 * - 정산(settle_checks): 누가 낸 돈·내 몫으로 최소 송금 목록 + 체크리스트
 * index.html의 전역(DATA, $, esc, chip, enqueue, afterLocalChange …)을 그대로 씀
 */

let currentJourneyId = null;      // 열려 있는 여행 상세
let journeySub = 'overview';      // overview | money | places | settle
let returnToJourney = null;       // 일행 기록 수정 뒤 돌아갈 여행
let placeDayFilter = '';          // 장소 탭 날짜 필터
let editingExpense = null;        // 지출 폼에서 고치는 중인 지출 (새 지출이면 id만 새로)
let editingPlace = null;

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const EXP_CATS = [
  { key: 'flight', emoji: '✈️', name: '항공' },
  { key: 'stay', emoji: '🏨', name: '숙소' },
  { key: 'food', emoji: '🍜', name: '식비' },
  { key: 'cafe', emoji: '☕', name: '카페·술' },
  { key: 'transport', emoji: '🚕', name: '교통' },
  { key: 'tour', emoji: '🎫', name: '관광·입장료' },
  { key: 'shopping', emoji: '🛍', name: '쇼핑' },
  { key: 'etc', emoji: '📱', name: '기타' },
];
// 지도 핀 색: 검증한 범주형 팔레트(7색)를 정해진 순서대로. 핀·목록에 이모지도 같이 써서 색만으로 구분하지 않음
const PLACE_CATS = [
  { key: 'food', emoji: '🍜', name: '맛집', color: '#2a78d6', exp: 'food' },
  { key: 'cafe', emoji: '☕', name: '카페', color: '#eb6834', exp: 'cafe' },
  { key: 'bar', emoji: '🍺', name: '술집', color: '#1baf7a', exp: 'cafe' },
  { key: 'sight', emoji: '🏛', name: '관광지', color: '#eda100', exp: 'tour' },
  { key: 'shopping', emoji: '🛍', name: '쇼핑', color: '#e87ba4', exp: 'shopping' },
  { key: 'stay', emoji: '🏨', name: '숙소', color: '#008300', exp: 'stay' },
  { key: 'etc', emoji: '📍', name: '기타', color: '#6250d6', exp: 'etc' },
];
const expCat = k => EXP_CATS.find(c => c.key === k) || EXP_CATS[EXP_CATS.length - 1];
const placeCat = k => PLACE_CATS.find(c => c.key === k) || PLACE_CATS[PLACE_CATS.length - 1];

// 나라 → 통화 (지출 기본 통화). 없으면 USD
const CURRENCY_BY_COUNTRY = {
  KR: 'KRW', JP: 'JPY', CN: 'CNY', TW: 'TWD', HK: 'HKD', MO: 'MOP', MN: 'MNT', TH: 'THB', VN: 'VND', PH: 'PHP', SG: 'SGD',
  MY: 'MYR', ID: 'IDR', KH: 'USD', LA: 'LAK', MM: 'MMK', BN: 'BND', IN: 'INR', NP: 'NPR', LK: 'LKR', MV: 'USD', BD: 'BDT',
  PK: 'PKR', BT: 'BTN', KZ: 'KZT', UZ: 'UZS', KG: 'KGS', AE: 'AED', TR: 'TRY', IL: 'ILS', JO: 'JOD', QA: 'QAR', SA: 'SAR',
  OM: 'OMR', BH: 'BHD', KW: 'KWD', GE: 'GEL', AM: 'AMD', AZ: 'AZN', GB: 'GBP', CH: 'CHF', CZ: 'CZK', HU: 'HUF', PL: 'PLN',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK', RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL', BG: 'BGN', RO: 'RON', MD: 'MDL',
  UA: 'UAH', RU: 'RUB', US: 'USD', GU: 'USD', MP: 'USD', PR: 'USD', CA: 'CAD', MX: 'MXN', CU: 'CUP', JM: 'JMD', DO: 'DOP',
  BS: 'BSD', GT: 'GTQ', CR: 'CRC', PA: 'USD', BR: 'BRL', AR: 'ARS', CL: 'CLP', PE: 'PEN', BO: 'BOB', CO: 'COP', EC: 'USD',
  UY: 'UYU', PY: 'PYG', AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PW: 'USD', PF: 'XPF', NC: 'XPF', EG: 'EGP', MA: 'MAD', TN: 'TND',
  ZA: 'ZAR', KE: 'KES', TZ: 'TZS', ET: 'ETB', MU: 'MUR', SC: 'SCR', MG: 'MGA', NA: 'NAD', BW: 'BWP', ZW: 'USD', ZM: 'ZMW',
  NG: 'NGN', GH: 'GHS', SN: 'XOF', RW: 'RWF', UG: 'UGX', CY: 'EUR', MT: 'EUR',
};
const EURO = ['FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'LU', 'AT', 'SK', 'SI', 'HR', 'GR', 'EE', 'LV', 'LT', 'FI', 'IE', 'MC', 'VA', 'SM', 'ME', 'XK', 'AD'];
EURO.forEach(c => { CURRENCY_BY_COUNTRY[c] = 'EUR'; });
const COMMON_CURRENCIES = ['KRW', 'USD', 'JPY', 'EUR', 'CNY', 'TWD', 'HKD', 'THB', 'VND', 'PHP', 'SGD', 'MYR', 'IDR', 'GBP', 'AUD', 'CAD', 'CHF', 'TRY', 'AED'];
const ZERO_DECIMAL = ['KRW', 'JPY', 'VND', 'IDR', 'TWD', 'CLP', 'PYG', 'UGX', 'RWF', 'XOF', 'XPF', 'ISK', 'HUF', 'LAK', 'KHR', 'MNT', 'UZS', 'MMK'];

/* ───────── 숫자·날짜 ───────── */
const won = n => Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원';
function money(amount, cur) {
  try {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: ZERO_DECIMAL.includes(cur) ? 0 : 2 }).format(Number(amount) || 0);
  } catch (e) { return (Number(amount) || 0).toLocaleString('ko-KR') + ' ' + cur; }
}
const md = iso => iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '';
const weekday = iso => WEEK[new Date(iso + 'T00:00:00').getDay()];
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const flagEmoji = code => code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';
const arr = v => (Array.isArray(v) ? v : []).map(String);

/* ───────── DB 줄 ↔ 화면 ───────── */
function rowToJourney(r) { return { id: String(r.id), title: r.title || '', guests: arr(r.guests), memo: r.memo || '' }; }
const journeyToRow = j => ({ id: j.id, title: j.title || '', guests: j.guests || [], memo: j.memo || '' });
function rowToExpense(r) {
  return { id: String(r.id), journeyId: r.journey_id, paidOn: String(r.paid_on).slice(0, 10), category: r.category || 'etc',
    title: r.title || '', amount: Number(r.amount) || 0, currency: r.currency || 'KRW', fxRate: r.fx_rate == null ? null : Number(r.fx_rate),
    krw: Number(r.krw) || 0, krwManual: !!r.krw_manual, payer: r.payer || '', method: r.method || '', split: arr(r.split_with),
    personal: !!r.personal, placeId: r.place_id || '', memo: r.memo || '' };
}
const expenseToRow = e => ({ id: e.id, journey_id: e.journeyId, paid_on: e.paidOn, category: e.category, title: e.title,
  amount: e.amount, currency: e.currency, fx_rate: e.fxRate, krw: Math.round(e.krw), krw_manual: !!e.krwManual, payer: e.payer,
  method: e.method, split_with: e.split, personal: !!e.personal, place_id: e.placeId || null, memo: e.memo });
function rowToPlace(r) {
  return { id: String(r.id), journeyId: r.journey_id, visitedOn: r.visited_on ? String(r.visited_on).slice(0, 10) : '', name: r.name,
    category: r.category || 'etc', googlePlaceId: r.google_place_id || '', lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng), address: r.address || '', rating: r.rating == null ? null : Number(r.rating),
    memo: r.memo || '', addedBy: r.added_by || '' };
}
const placeToRow = p => ({ id: p.id, journey_id: p.journeyId, visited_on: p.visitedOn || null, name: p.name, category: p.category,
  google_place_id: p.googlePlaceId || null, lat: p.lat, lng: p.lng, address: p.address || '', rating: p.rating || null,
  memo: p.memo || '', added_by: p.addedBy || '' });
function rowToCheck(r) { return { id: String(r.id), journeyId: r.journey_id, from: r.from_person, to: r.to_person, amount: Number(r.amount) || 0, checkedAt: r.checked_at || '' }; }
const checkToRow = c => ({ id: c.id, journey_id: c.journeyId, from_person: c.from, to_person: c.to, amount: Math.round(c.amount) });

/** 저장: 화면에 먼저 반영하고 대기열로 보냄 (재시도해도 같은 ID라 중복 없음) */
const saveRows = (tableName, rows) => { if (rows.length) enqueue('upsert', { table: tableName, rows }); };
const removeRow = (tableName, id) => enqueue('remove', { table: tableName, id });

/* ───────── 여행 묶음 ───────── */
const getJourney = id => (DATA.journeys || []).find(j => j.id === id);
const membersOf = id => DATA.trips.filter(t => t.journeyId === id);

/** 묶음 정보: 일행·기간(가장 빠른 출국 ~ 가장 늦은 입국)·나라(합집합)·정산 참여자 */
function journeyInfo(j) {
  const members = membersOf(j.id).sort((a, b) => (a.dep < b.dep ? -1 : a.dep > b.dep ? 1 : a.person.localeCompare(b.person, 'ko')));
  const people = [...new Set(members.map(t => t.person))];
  const dep = members.reduce((m, t) => (!m || t.dep < m ? t.dep : m), '');
  const ret = members.reduce((m, t) => ((t.ret || t.dep) > m ? (t.ret || t.dep) : m), '');
  const countries = [];
  members.forEach(t => t.countries.forEach(c => {
    const have = countries.find(x => x.name === c.name);
    if (have) c.cities.forEach(x => { if (!have.cities.includes(x)) have.cities.push(x); });
    else countries.push({ name: c.name, code: c.code, cities: c.cities.slice() });
  }));
  const guests = (j.guests || []).filter(g => !people.includes(g));
  const auto = countries.length
    ? countries.map(c => flagEmoji(c.code) + ' ' + (c.cities[0] && countries.length === 1 ? c.cities.slice(0, 2).join('·') : c.name)).join(' · ') + ' 여행'
    : `${dot(dep)} 여행`;
  return { journey: j, members, people, dep, ret, days: tripDays(dep, ret), countries, guests, participants: people.concat(guests),
           title: j.title || auto, planned: !!dep && dep > todayIso(), sameDates: members.every(t => t.dep === dep && (t.ret || t.dep) === ret) };
}

/** 같은 여행으로 볼까? 기간이 겹치고, 나라가 하나라도 같거나(둘 다 나라 미입력이면 출국일이 같을 때) */
function sameTrip(a, b) {
  const overlap = a.dep <= (b.ret || b.dep) && b.dep <= (a.ret || a.dep);
  if (!overlap) return false;
  if (!a.countries.length && !b.countries.length) return a.dep === b.dep;
  return a.countries.some(c => b.countries.some(d => d.name === c.name));
}

/**
 * 묶음이 없는 기록(증명서·옮겨오기·예전 기록)을 자동으로 묶음. 이미 있는 묶음과 맞으면 거기로, 아니면 서로끼리 묶어 새 묶음.
 * 새 묶음 ID는 기록 ID로 정해서, 두 기기가 동시에 해도 같은 결과
 */
function autoGroupJourneys() {
  if (!DATA || !DATA.journeys || DATA.needsSchema) return;
  const known = new Set(DATA.journeys.map(j => j.id));
  const newJourneys = [];
  const changed = [];
  // 묶음 줄이 없어진 기록은 같은 ID로 묶음을 다시 만듦
  DATA.trips.forEach(t => {
    if (t.journeyId && !known.has(t.journeyId)) { known.add(t.journeyId); newJourneys.push({ id: t.journeyId, title: '', guests: [], memo: '' }); }
  });
  const orphans = DATA.trips.filter(t => !t.journeyId);
  if (!orphans.length && !newJourneys.length) return;
  const grouped = DATA.trips.filter(t => t.journeyId);
  const rest = [];
  orphans.forEach(o => {
    const hit = grouped.find(t => sameTrip(o, t));
    if (hit) { o.journeyId = hit.journeyId; changed.push(o); } else rest.push(o);
  });
  // 남은 것끼리 묶기 (union-find)
  const parent = rest.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  rest.forEach((a, i) => rest.forEach((b, k) => { if (k > i && sameTrip(a, b)) parent[find(k)] = find(i); }));
  const clusters = {};
  rest.forEach((t, i) => (clusters[find(i)] = clusters[find(i)] || []).push(t));
  Object.values(clusters).forEach(list => {
    const id = 'j_' + list.map(t => t.id).sort()[0];
    if (!known.has(id)) { known.add(id); newJourneys.push({ id, title: '', guests: [], memo: '' }); }
    list.forEach(t => { t.journeyId = id; changed.push(t); });
  });
  DATA.journeys.push(...newJourneys);
  saveRows('journeys', newJourneys.map(journeyToRow));   // 묶음 먼저 (기록이 묶음을 가리키므로)
  saveRows('trips', changed.map(tripToRow));
  afterLocalChange();
}

/** + 추가로 새로 저장하는 기록: 같이 간 여행이 이미 있으면 거기로, 없으면 새 묶음 (같이 저장한 사람은 한 묶음) */
function assignJourneyForNewTrips(added) {
  if (!added.length || DATA.needsSchema) return;
  const others = DATA.trips.filter(t => t.journeyId && !added.includes(t));
  const hit = others.find(t => added.some(a => sameTrip(a, t)));
  let id = hit && hit.journeyId;
  if (!id) {
    id = 'j_' + newId();
    const j = { id, title: '', guests: [], memo: '' };
    DATA.journeys.push(j);
    saveRows('journeys', [journeyToRow(j)]);
  }
  added.forEach(t => { t.journeyId = id; });
}

/* ───────── 여행 목록 (묶음 단위) ───────── */
/** Supabase에 새 테이블(schema.sql 2단계)이 아직 없으면 안내 */
const schemaNotice = () => `<div class="card privacy" style="background:#fff4c2;color:#6b4e00">⚠️ 여행 묶음·가계부·장소를 쓰려면
  Supabase <b>SQL Editor</b>에서 <b>supabase/schema.sql</b>을 다시 한 번 실행해 주세요. (기존 기록은 그대로예요)</div>`;

function renderJourneyList() {
  if (DATA.needsSchema) {
    $('personFilter').innerHTML = '';
    $('tripList').innerHTML = schemaNotice() + DATA.trips.map(t => `<div class="trip jcard" data-orphan="${esc(t.id)}"><div style="flex:1"><div class="when">${dot(t.dep)} ~ ${dot(t.ret).slice(5)}</div><div class="who">${esc(t.person)}</div></div>
      <div>${t.countries.map(c => `<div class="tcountry">${chip(c)}<br>${cityLine(c.cities)}</div>`).join('')}</div></div>`).join('');
    $('tripList').querySelectorAll('.jcard').forEach(el => el.onclick = () => editTrip(el.dataset.orphan));
    return;
  }
  $('personFilter').innerHTML = [{ name: '' }].concat(DATA.family).map(f =>
    `<button class="pill ${filterPerson === f.name ? 'on' : ''}" data-person="${esc(f.name)}">${f.name ? esc(f.name) : '전체'}</button>`).join('');
  $('personFilter').querySelectorAll('button').forEach(b => b.onclick = () => { filterPerson = b.dataset.person; renderTrips(); });

  // 묶음 + 아직 묶음이 없는 기록(잠깐 동안)
  const items = (DATA.journeys || []).map(journeyInfo).filter(i => i.members.length)
    .filter(i => !filterPerson || i.people.includes(filterPerson));
  DATA.trips.filter(t => !t.journeyId && (!filterPerson || t.person === filterPerson)).forEach(t => {
    items.push(Object.assign(journeyInfo({ id: '__' + t.id, title: '', guests: [] }), { members: [t], people: [t.person], dep: t.dep, ret: t.ret,
      days: t.days, countries: t.countries, planned: isPlanned(t), title: t.countries.map(c => flagEmoji(c.code) + ' ' + c.name).join(' · ') || '나라 미정', orphan: t.id }));
  });
  const planned = items.filter(i => i.planned).sort((a, b) => (a.dep < b.dep ? -1 : 1));
  const done = items.filter(i => !i.planned).sort((a, b) => (a.dep < b.dep ? 1 : -1));
  const card = i => {
    const spend = (DATA.expenses || []).filter(e => e.journeyId === i.journey.id).reduce((n, e) => n + e.krw, 0);
    const nPlaces = (DATA.places || []).filter(p => p.journeyId === i.journey.id).length;
    const todo = i.members.some(t => !t.countries.length);
    const who = i.members.map(t => esc(t.person) + (!i.sameDates ? ` <span class="who">${md(t.dep)}~${md(t.ret)}</span>` : '')).join(' · ') +
      (i.guests.length ? ' · ' + i.guests.map(g => `<span class="guest">${esc(g)}</span>`).join(' · ') : '');
    return `<div class="trip jcard ${i.planned ? 'planned' : todo ? 'todo' : ''}" data-jid="${esc(i.journey.id)}" data-orphan="${esc(i.orphan || '')}">
      <div style="flex:1;min-width:0">
        <div class="when">${i.planned ? `<span class="tag plan">예정 ${dday(i.dep)}</span> ` : ''}<b>${esc(i.title)}</b></div>
        <div class="who">${dot(i.dep)} ~ ${dot(i.ret).slice(5) || '?'}${i.days ? ` (${i.days - 1}박${i.days}일)` : ''}</div>
        <div class="who">${who}</div>
        ${spend || nPlaces ? `<div class="memo">${spend ? '💰 ' + won(spend) : ''}${spend && nPlaces ? ' · ' : ''}${nPlaces ? '📍 ' + nPlaces + '곳' : ''}</div>` : ''}
      </div>
      <div>${i.countries.map(c => `<div class="tcountry">${chip(c)}<br>${cityLine(c.cities)}</div>`).join('') || '<span class="missing">나라 입력하기 ›</span>'}</div>
    </div>`;
  };
  $('tripList').innerHTML =
    (planned.length ? `<div class="sectionhead">🗓️ 예정 여행 ${planned.length}건</div>` + planned.map(card).join('') +
      (done.length ? `<div class="sectionhead" style="margin-top:14px">✈️ 다녀온 여행 ${done.length}건</div>` : '') : '') +
    (done.map(card).join('') || (planned.length ? '' : '<div class="note">여행 기록이 없어요</div>'));
  $('tripList').querySelectorAll('.jcard').forEach(el => el.onclick = () => {
    if (el.dataset.orphan) { returnToJourney = null; editTrip(el.dataset.orphan); } else openJourney(el.dataset.jid);
  });
}

function openTripOrJourney(tripId) {
  const t = DATA.trips.find(x => x.id === tripId);
  if (t && t.journeyId && getJourney(t.journeyId)) openJourney(t.journeyId); else editTrip(tripId);
}

/** 일행 기록 수정 폼에서 돌아갈 곳 */
function backFromForm(t) {
  if (returnToJourney && getJourney(returnToJourney) && membersOf(returnToJourney).length) openJourney(returnToJourney);
  else showTab('trips');
}

/* ───────── 여행 상세 ───────── */
function openJourney(id, sub) {
  editingExpense = editingPlace = null;
  if (sub) journeySub = sub;
  if (currentJourneyId !== id) { placeDayFilter = ''; if (!sub) journeySub = 'overview'; }
  showTab('journey');
  currentJourneyId = id;
  renderJourney();
}

function renderJourney() {
  const j = getJourney(currentJourneyId);
  const box = $('journeyView');
  if (!j || !membersOf(j.id).length) { box.innerHTML = '<div class="card note">이 여행에 일행 기록이 없어요. <a href="#" id="jBack">← 여행 목록</a></div>';
    $('jBack').onclick = e => { e.preventDefault(); showTab('trips'); }; return; }
  const i = journeyInfo(j);
  const subs = [['overview', '개요'], ['money', '💰 가계부'], ['places', '📍 장소'], ['settle', '💸 정산']];
  box.innerHTML = `
    <div class="jhead">
      <button class="btn ghost small" id="jBack">← 목록</button>
      <div class="jtitle"><h2 id="jTitle" title="눌러서 이름 바꾸기">${esc(i.title)} <span class="edit">✎</span></h2>
        <div class="who">${dot(i.dep)} ~ ${dot(i.ret)}${i.days ? ` · ${i.days - 1}박${i.days}일` : ''}${i.planned ? ` · <b style="color:var(--accent)">${dday(i.dep)}</b>` : ''}</div></div>
    </div>
    <div class="subtabs">${subs.map(([k, n]) => `<button class="pill ${journeySub === k ? 'on' : ''}" data-sub="${k}">${n}</button>`).join('')}</div>
    <div id="jBody"></div>`;
  $('jBack').onclick = () => showTab('trips');
  $('jTitle').onclick = () => {
    const name = prompt('여행 이름 (비우면 자동으로 지어져요)', j.title || i.title);
    if (name === null) return;
    j.title = name.trim(); saveRows('journeys', [journeyToRow(j)]); afterLocalChange();
  };
  box.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { journeySub = b.dataset.sub; editingExpense = editingPlace = null; renderJourney(); });
  ({ overview: renderOverview, money: renderMoney, places: renderPlaces, settle: renderSettle })[journeySub](i);
}

/* ── 개요: 일행(날짜가 달라도 OK), 가족 외 일행, 메모, 요약 ── */
function renderOverview(i) {
  const j = i.journey;
  const ex = (DATA.expenses || []).filter(e => e.journeyId === j.id);
  const total = ex.reduce((n, e) => n + e.krw, 0);
  const nPlaces = (DATA.places || []).filter(p => p.journeyId === j.id).length;
  // 같은 여행일 수 있는 다른 기록: 기간이 겹치거나 일주일 안쪽
  const near = DATA.trips.filter(t => t.journeyId !== j.id && t.dep <= addDays(i.ret || i.dep, 7) && (t.ret || t.dep) >= addDays(i.dep, -7));
  $('jBody').innerHTML = `
    <div class="card">
      <div class="nums" style="grid-template-columns:repeat(3,1fr)">
        <div><b>${i.participants.length}</b><span>일행</span></div>
        <div><b style="font-size:18px">${total ? won(total) : '–'}</b><span>총지출</span></div>
        <div><b>${nPlaces}</b><span>기록한 장소</span></div>
      </div>
    </div>
    <div class="card">
      <h3 class="ch">👨‍👩‍👧 가족 일행 <span class="note">(사람마다 날짜가 달라도 돼요)</span></h3>
      ${i.members.map(t => `<div class="mrow">
          <div style="flex:1;min-width:0"><b>${esc(t.person)}</b> <span class="who">${dot(t.dep)} ~ ${dot(t.ret).slice(5) || '?'}${t.days ? ` (${t.days - 1}박${t.days}일)` : ''}</span>
            <div class="flags" style="margin-top:4px">${t.countries.map(c => `<span>${chip(c)} ${cityLine(c.cities)}</span>`).join('') || '<span class="missing">나라 입력하기</span>'}</div></div>
          <button class="btn ghost small" data-edit="${esc(t.id)}">수정</button>
          ${i.members.length > 1 ? `<button class="btn ghost small" data-detach="${esc(t.id)}" title="이 여행에서 빼기">빼기</button>` : ''}
        </div>`).join('')}
      ${near.length ? `<details class="near"><summary>+ 다른 가족 기록을 이 여행에 넣기 (${near.length})</summary>
        ${near.map(t => `<div class="mrow"><div style="flex:1">${esc(t.person)} <span class="who">${dot(t.dep)} ~ ${dot(t.ret).slice(5)} · ${t.countries.map(c => c.name).join(', ') || '나라 미정'}</span></div>
          <button class="btn small" data-attach="${esc(t.id)}">넣기</button></div>`).join('')}</details>` : ''}
      <div class="note">새 가족 일행 기록은 <b>＋ 추가</b>에서 저장하면 날짜·나라가 겹치는 이 여행에 자동으로 들어와요.</div>
    </div>
    <div class="card">
      <h3 class="ch">🙋 가족 외 일행 <span class="note">(정산에만 들어가요)</span></h3>
      <div class="flags">${i.guests.map(g => `<span class="citychip">${esc(g)}<button class="x" data-guest="${esc(g)}">×</button></span>`).join('') || '<span class="note">없음</span>'}</div>
      <div class="row2" style="margin-top:8px"><input type="text" id="guestIn" placeholder="이름 (예: 최미라)"><button class="btn ghost" id="guestAdd">추가</button></div>
    </div>
    <div class="card">
      <h3 class="ch">📝 여행 메모</h3>
      <textarea id="jMemo" rows="3" placeholder="예: 대한항공 KE461 · 숙소 바우처 메일함 확인">${esc(j.memo)}</textarea>
    </div>`;
  $('jBody').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { returnToJourney = j.id; editTrip(b.dataset.edit); });
  $('jBody').querySelectorAll('[data-detach]').forEach(b => b.onclick = () => {
    const t = DATA.trips.find(x => x.id === b.dataset.detach);
    if (!t || !confirm(`${t.person}의 기록을 이 여행에서 뺄까요? (따로 떨어진 여행이 돼요)`)) return;
    const nj = { id: 'j_' + newId(), title: '', guests: [], memo: '' };
    DATA.journeys.push(nj); t.journeyId = nj.id;
    saveRows('journeys', [journeyToRow(nj)]); saveRows('trips', [tripToRow(t)]); afterLocalChange();
  });
  $('jBody').querySelectorAll('[data-attach]').forEach(b => b.onclick = () => {
    const t = DATA.trips.find(x => x.id === b.dataset.attach);
    if (!t) return;
    t.journeyId = j.id; saveRows('trips', [tripToRow(t)]); afterLocalChange(); toast(`${t.person}의 기록을 넣었어요`);
  });
  $('jBody').querySelectorAll('[data-guest]').forEach(b => b.onclick = () => {
    j.guests = j.guests.filter(g => g !== b.dataset.guest); saveRows('journeys', [journeyToRow(j)]); afterLocalChange();
  });
  const addGuest = () => {
    const name = $('guestIn').value.trim();
    if (!name) return;
    if (i.participants.includes(name)) return toast('이미 일행이에요');
    j.guests = (j.guests || []).concat(name); saveRows('journeys', [journeyToRow(j)]); afterLocalChange();
  };
  $('guestAdd').onclick = addGuest;
  $('guestIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addGuest(); } });
  $('jMemo').addEventListener('change', () => { j.memo = $('jMemo').value; saveRows('journeys', [journeyToRow(j)]); toast('메모를 저장했어요'); });
}

/* ── 💰 가계부: 요약 + 결제일별 목록 ── */
function dayLabel(iso, i, forPlaces) {
  if (iso < i.dep) return { key: '0-before', label: forPlaces ? '✈️ 여행 전' : '✈️ 여행 전 결제' };
  if (i.ret && iso > i.ret) return { key: '9-after', label: forPlaces ? '🏠 여행 후' : '🏠 여행 후 결제' };
  const n = Math.round((Date.parse(iso) - Date.parse(i.dep)) / 86400000) + 1;
  return { key: '5-' + iso, label: `Day ${n} · ${md(iso)} (${weekday(iso)})` };
}

function renderMoney(i) {
  const j = i.journey;
  if (editingExpense) return renderExpenseForm(i);
  const ex = (DATA.expenses || []).filter(e => e.journeyId === j.id).sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0));
  const total = ex.reduce((n, e) => n + e.krw, 0);
  const n = Math.max(i.participants.length, 1);
  const byCat = EXP_CATS.map(c => ({ c, krw: ex.filter(e => e.category === c.key).reduce((s, e) => s + e.krw, 0) })).filter(x => x.krw).sort((a, b) => b.krw - a.krw);
  const max = byCat.length ? byCat[0].krw : 1;
  const byCur = {};
  ex.filter(e => e.currency !== 'KRW').forEach(e => { byCur[e.currency] = (byCur[e.currency] || 0) + e.amount; });
  const byPayer = {};
  ex.forEach(e => { if (e.payer) byPayer[e.payer] = (byPayer[e.payer] || 0) + e.krw; });
  const groups = {};
  ex.forEach(e => { const d = dayLabel(e.paidOn, i); (groups[d.key] = groups[d.key] || { label: d.label, items: [] }).items.push(e); });
  const placeName = id => { const p = (DATA.places || []).find(x => x.id === id); return p ? p.name : ''; };

  $('jBody').innerHTML = `
    <div class="card">
      <div class="hero"><span class="note">총지출</span><b>${won(total)}</b><span class="note">1인당 ${won(total / n)} (${n}명)</span></div>
      ${byCat.length ? `<div class="bars" role="list" aria-label="종류별 지출">${byCat.map(x => `
        <div class="bar" role="listitem" title="${x.c.name} ${won(x.krw)} · ${Math.round(x.krw / total * 100)}%">
          <span class="bl">${x.c.emoji} ${x.c.name}</span>
          <span class="bt"><i style="width:${Math.max(x.krw / max * 100, 2)}%"></i></span>
          <span class="bv">${won(x.krw)} <span class="note">${Math.round(x.krw / total * 100)}%</span></span>
        </div>`).join('')}</div>` : ''}
      ${Object.keys(byCur).length ? `<div class="note">현지화폐 합계: ${Object.entries(byCur).map(([c, a]) => money(a, c)).join(' · ')}</div>` : ''}
      ${Object.keys(byPayer).length ? `<div class="note">결제한 사람: ${Object.entries(byPayer).sort((a, b) => b[1] - a[1]).map(([p, k]) => `${esc(p)} ${won(k)}`).join(' · ')}</div>` : ''}
      <div class="actions"><button class="btn" id="expAdd">＋ 지출 추가</button></div>
    </div>
    ${Object.keys(groups).sort().map(k => {
      const g = groups[k];
      const sub = g.items.reduce((s, e) => s + e.krw, 0);
      const local = {};
      g.items.filter(e => e.currency !== 'KRW').forEach(e => { local[e.currency] = (local[e.currency] || 0) + e.amount; });
      return `<div class="card day">
        <div class="dayhead"><b>${g.label}</b><span><b>${won(sub)}</b>${Object.keys(local).length ? ' <span class="note">' + Object.entries(local).map(([c, a]) => money(a, c)).join(' · ') + '</span>' : ''}</span></div>
        ${g.items.map(e => `<div class="erow" data-exp="${esc(e.id)}">
          <span class="eicon">${expCat(e.category).emoji}</span>
          <div style="flex:1;min-width:0"><div>${esc(e.title || expCat(e.category).name)}${e.personal ? ' <span class="tag dup">개인</span>' : ''}</div>
            <div class="who">${[e.payer && esc(e.payer) + ' 결제', e.method && esc(e.method), e.placeId && '📍 ' + esc(placeName(e.placeId))].filter(Boolean).join(' · ')}</div></div>
          <div class="eamt">${e.currency !== 'KRW' ? `<div>${money(e.amount, e.currency)}</div>` : ''}<div class="${e.currency !== 'KRW' ? 'who' : ''}">${e.krwManual ? '💳 ' : ''}${won(e.krw)}</div></div>
        </div>`).join('')}
      </div>`;
    }).join('') || '<div class="card note">아직 지출 기록이 없어요. 항공·숙소처럼 여행 전에 결제한 것도 넣어 주세요.</div>'}`;
  $('expAdd').onclick = () => { editingExpense = newExpense(i); renderJourney(); };
  $('jBody').querySelectorAll('[data-exp]').forEach(el => el.onclick = () => {
    editingExpense = Object.assign({}, DATA.expenses.find(e => e.id === el.dataset.exp)); renderJourney();
  });
}

function defaultCurrency(i) {
  const c = i.countries.find(x => x.code && x.code !== 'KR');
  return (c && CURRENCY_BY_COUNTRY[c.code]) || (c ? 'USD' : 'KRW');
}
/** 결제일에 맞는 기본 통화: 여행 전 결제(항공·숙소 예약)는 원화, 여행 중엔 마지막에 쓴 현지 통화 또는 그 나라 통화 */
function currencyForDate(i, date) {
  if (date && date < i.dep) return 'KRW';
  return store.get('famCur:' + i.journey.id) || defaultCurrency(i);
}
function newExpense(i, extra) {
  const today = todayIso();
  const lastPayer = store.get('famLastPayer');
  const e = Object.assign({
    id: newId(), journeyId: i.journey.id, isNew: true,
    paidOn: today >= i.dep && today <= (i.ret || i.dep) ? today : (today < i.dep ? today : i.dep),
    category: 'food', title: '', amount: '', curTouched: false,
    fxRate: null, krw: '', krwManual: false, rateManual: false,
    payer: i.participants.includes(lastPayer) ? lastPayer : (i.participants[0] || ''), method: '',
    split: i.participants.slice(), personal: false, placeId: '', memo: '',
  }, extra || {});
  e.currency = currencyForDate(i, e.paidOn);
  return e;
}

/* 환율: 결제일 기준 (1 단위당 원화). 무료 공개 환율(fawazahmed0 currency-api), 기기에 캐시 */
async function fxRate(cur, date) {
  if (!cur || cur === 'KRW') return 1;
  const day = !date || date >= todayIso() ? 'latest' : date;
  const k = `famFx:${cur}:${day === 'latest' ? todayIso() : day}`;
  const hit = Number(store.get(k));
  if (hit) return hit;
  const c = cur.toLowerCase();
  const urls = [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/${c}.min.json`,
                `https://${day}.currency-api.pages.dev/v1/currencies/${c}.min.json`];
  if (day !== 'latest') urls.push(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${c}.min.json`);
  for (const u of urls) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(u, { signal: ctrl.signal }); clearTimeout(t);
      if (!r.ok) continue;
      const rate = Number(((await r.json())[c] || {}).krw);
      if (rate) { store.set(k, String(rate)); return rate; }
    } catch (e) { /* 다음 주소 */ }
  }
  return null;
}

function renderExpenseForm(i) {
  const e = editingExpense;
  const curs = [...new Set([e.currency, defaultCurrency(i)].concat(COMMON_CURRENCIES))];
  const places = (DATA.places || []).filter(p => p.journeyId === i.journey.id);
  $('jBody').innerHTML = `
    <div class="card">
      <h3 class="ch">${e.isNew ? '＋ 지출 추가' : '지출 수정'}</h3>
      <label>종류</label>
      <div class="filters" id="eCat">${EXP_CATS.map(c => `<button class="pill ${e.category === c.key ? 'on' : ''}" data-cat="${c.key}">${c.emoji} ${c.name}</button>`).join('')}</div>
      <label>내용</label><input type="text" id="eTitle" value="${esc(e.title)}" placeholder="예: 아시아나항공, 아고다, 이치란 라멘">
      <div class="row2">
        <div><label>결제일</label><input type="date" id="eDate" value="${esc(e.paidOn)}"></div>
        <div><label>통화</label><select id="eCur">${curs.map(c => `<option ${c === e.currency ? 'selected' : ''}>${c}</option>`).join('')}<option value="__other">직접 입력…</option></select></div>
      </div>
      <div class="row2">
        <div><label>금액 (${esc(e.currency)})</label><input type="number" inputmode="decimal" id="eAmt" value="${esc(e.amount)}" placeholder="0"></div>
        <div ${e.currency === 'KRW' ? 'class="hidden"' : ''}><label>환율 (1${esc(e.currency)} = ?원) <span id="eRateNote" class="note"></span></label><input type="number" inputmode="decimal" id="eRate" value="${e.fxRate == null ? '' : esc(e.fxRate)}" step="any"></div>
      </div>
      <div ${e.currency === 'KRW' ? 'class="hidden"' : ''}>
        <label>원화 <span class="note">카드 청구 금액을 알면 그대로 넣어 주세요 (우선 적용)</span></label>
        <div class="row2"><input type="number" inputmode="numeric" id="eKrw" value="${esc(e.krw)}"><span id="eKrwTag" class="note" style="align-self:center">${e.krwManual ? '💳 카드 청구액' : '환율로 자동 계산'}</span></div>
      </div>
      <div class="row2">
        <div><label>결제한 사람</label><select id="ePayer">${i.participants.map(p => `<option ${p === e.payer ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div><label>결제수단 메모</label><input type="text" id="eMethod" value="${esc(e.method)}" placeholder="예: 민정 현대카드, 현금" list="methodList">
          <datalist id="methodList">${[...new Set((DATA.expenses || []).map(x => x.method).filter(Boolean))].slice(0, 20).map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
      </div>
      <label>함께 쓴 사람 <span class="note">(정산할 때 나눠 낼 사람)</span></label>
      <div class="filters" id="eSplit">${i.participants.map(p => `<button class="pill ${e.split.includes(p) ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="ePersonal" ${e.personal ? 'checked' : ''}> 개인 지출 (정산에서 빼기)</label>
      ${places.length ? `<label>장소 연결</label><select id="ePlace"><option value="">없음</option>${places.map(p => `<option value="${esc(p.id)}" ${p.id === e.placeId ? 'selected' : ''}>${placeCat(p.category).emoji} ${esc(p.name)}</option>`).join('')}</select>` : ''}
      <label>메모</label><input type="text" id="eMemo" value="${esc(e.memo)}">
      <div class="actions">
        <button class="btn" id="eSave">저장</button>
        <button class="btn ghost" id="eCancel">취소</button>
        ${e.isNew ? '' : '<button class="btn danger" id="eDel">삭제</button>'}
      </div>
    </div>`;

  const read = () => {
    e.title = $('eTitle').value.trim(); e.paidOn = $('eDate').value; e.amount = $('eAmt').value;
    e.method = $('eMethod').value.trim(); e.payer = $('ePayer').value; e.personal = $('ePersonal').checked;
    e.memo = $('eMemo').value.trim(); if ($('ePlace')) e.placeId = $('ePlace').value;
    if (e.currency !== 'KRW') { e.fxRate = $('eRate').value === '' ? null : Number($('eRate').value); e.krw = $('eKrw').value; }
  };
  const recalcKrw = () => {
    if (e.currency === 'KRW') return;
    if (!e.krwManual && $('eAmt').value !== '' && $('eRate').value !== '') $('eKrw').value = Math.round(Number($('eAmt').value) * Number($('eRate').value));
  };
  const loadRate = async () => {
    if (e.currency === 'KRW' || e.rateManual) return;
    $('eRateNote').textContent = '불러오는 중…';
    const r = await fxRate(e.currency, $('eDate').value);
    if (!$('eRate')) return;
    if (r) { $('eRate').value = Math.round(r * 10000) / 10000; $('eRateNote').textContent = `${md($('eDate').value) || '오늘'} 기준`; recalcKrw(); }
    else $('eRateNote').textContent = '못 불러왔어요 · 직접 입력';
  };
  $('eCat').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { read(); e.category = b.dataset.cat; renderExpenseForm(i); });
  $('eSplit').querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const p = b.dataset.p; e.split = e.split.includes(p) ? e.split.filter(x => x !== p) : e.split.concat(p); b.classList.toggle('on');
  });
  $('eCur').onchange = () => {
    read();
    let c = $('eCur').value;
    if (c === '__other') c = (prompt('통화 코드 (예: GBP, CZK)') || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(c)) { e.currency = c; e.curTouched = true; e.fxRate = null; e.rateManual = false; e.krwManual = false; e.krw = c === 'KRW' ? e.amount : ''; }
    renderExpenseForm(i);
    if (e.currency !== 'KRW') loadRate();
  };
  $('eDate').onchange = () => {
    e.rateManual = false;
    // 통화를 직접 고르지 않았으면 날짜에 맞춰 바꿔 줌 (여행 전 → 원화, 여행 중 → 현지 통화)
    if (e.isNew && !e.curTouched) {
      const c = currencyForDate(i, $('eDate').value);
      if (c !== e.currency) { read(); e.currency = c; e.fxRate = null; e.krwManual = false; e.krw = ''; renderExpenseForm(i); if (c !== 'KRW') loadRate(); return; }
    }
    loadRate();
  };
  $('eAmt').oninput = recalcKrw;
  if ($('eRate')) $('eRate').oninput = () => { e.rateManual = true; $('eRateNote').textContent = '직접 입력'; recalcKrw(); };
  if ($('eKrw')) $('eKrw').oninput = () => { e.krwManual = $('eKrw').value !== ''; $('eKrwTag').textContent = e.krwManual ? '💳 카드 청구액' : '환율로 자동 계산'; if (!e.krwManual) recalcKrw(); };
  $('eCancel').onclick = () => { editingExpense = null; renderJourney(); };
  if ($('eDel')) $('eDel').onclick = () => {
    if (!confirm('이 지출을 삭제할까요?')) return;
    DATA.expenses = DATA.expenses.filter(x => x.id !== e.id); removeRow('expenses', e.id);
    editingExpense = null; afterLocalChange(); toast('삭제했어요');
  };
  $('eSave').onclick = () => {
    read();
    const amount = Number(e.amount);
    if (!e.paidOn) return toast('결제일을 넣어 주세요');
    if (!(amount > 0)) return toast('금액을 넣어 주세요');
    let krw = e.currency === 'KRW' ? amount : Number(e.krw);
    if (e.currency !== 'KRW' && !(krw > 0)) {
      if (e.fxRate > 0) krw = amount * e.fxRate; else return toast('환율이나 원화 금액을 넣어 주세요');
    }
    if (!e.split.length) e.split = i.participants.slice();
    const saved = { id: e.id, journeyId: e.journeyId, paidOn: e.paidOn, category: e.category, title: e.title, amount,
      currency: e.currency, fxRate: e.currency === 'KRW' ? 1 : e.fxRate, krw: Math.round(krw), krwManual: e.currency !== 'KRW' && !!e.krwManual,
      payer: e.payer, method: e.method, split: e.split, personal: e.personal, placeId: e.placeId || '', memo: e.memo };
    DATA.expenses = (DATA.expenses || []).filter(x => x.id !== saved.id).concat(saved);
    saveRows('expenses', [expenseToRow(saved)]);
    if (saved.currency !== 'KRW') store.set('famCur:' + i.journey.id, saved.currency);
    store.set('famLastPayer', saved.payer);
    editingExpense = null; afterLocalChange(); toast('저장했어요 💰');
  };
  if (e.isNew && e.currency !== 'KRW' && e.fxRate == null) loadRate();
}

/* ── 📍 장소 (구글지도) ── */
let gmapsPromise = null;
function loadGoogleMaps() {
  if (window.google && google.maps && google.maps.Map) return Promise.resolve(google.maps);
  if (!CFG.googleMapsKey) return Promise.reject(new Error('구글 지도 키가 없어요'));
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    window.__famGmapsReady = () => resolve(google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CFG.googleMapsKey)}&libraries=places&v=weekly&language=ko&loading=async&callback=__famGmapsReady`;
    s.async = true;
    s.onerror = () => { gmapsPromise = null; reject(new Error('구글 지도를 불러오지 못했어요')); };
    document.head.appendChild(s);
  });
  return gmapsPromise;
}
const mapsLink = p => p.googlePlaceId
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.googlePlaceId)}`
  : p.lat != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + (p.address || ''))}`;

function renderPlaces(i) {
  const j = i.journey;
  if (editingPlace) return renderPlaceForm(i);
  const all = (DATA.places || []).filter(p => p.journeyId === j.id);
  const days = [...new Set(all.map(p => p.visitedOn).filter(Boolean))].sort();
  const shown = all.filter(p => !placeDayFilter || p.visitedOn === placeDayFilter);
  const spentAt = id => (DATA.expenses || []).filter(e => e.placeId === id).reduce((n, e) => n + e.krw, 0);
  const groups = {};
  shown.forEach(p => { const k = p.visitedOn || '9999'; (groups[k] = groups[k] || []).push(p); });
  $('jBody').innerHTML = `
    <div class="card">
      <div id="jMap" class="jmap ${CFG.googleMapsKey ? '' : 'hidden'}"><div class="note" style="padding:20px">지도 불러오는 중…</div></div>
      ${days.length > 1 ? `<div class="filters" id="pDays" style="margin-top:10px"><button class="pill ${!placeDayFilter ? 'on' : ''}" data-day="">전체</button>${days.map(d => `<button class="pill ${placeDayFilter === d ? 'on' : ''}" data-day="${d}">${md(d)}(${weekday(d)})</button>`).join('')}</div>` : ''}
      <div class="legend">${PLACE_CATS.filter(c => all.some(p => p.category === c.key)).map(c => `<span><i style="background:${c.color}"></i>${c.emoji} ${c.name}</span>`).join('')}</div>
      <div class="actions">
        <button class="btn" id="pAdd">＋ 장소 추가</button>
        ${CFG.googleMapsKey ? '<button class="btn ghost" id="pNear">📍 지금 여기 근처</button>' : ''}
      </div>
    </div>
    ${Object.keys(groups).sort().map(k => `<div class="card day">
      <div class="dayhead"><b>${k === '9999' ? '날짜 미정' : dayLabel(k, i, true).label}</b><span class="note">${groups[k].length}곳</span></div>
      ${groups[k].map(p => `<div class="erow">
        <span class="eicon" style="box-shadow:inset 0 0 0 2px ${placeCat(p.category).color}">${placeCat(p.category).emoji}</span>
        <div style="flex:1;min-width:0" data-place="${esc(p.id)}">
          <div><b>${esc(p.name)}</b> ${p.rating ? `<span class="stars" aria-label="별점 ${p.rating}">${'★'.repeat(p.rating)}<span class="off">${'★'.repeat(5 - p.rating)}</span></span>` : ''}</div>
          <div class="who">${[placeCat(p.category).name, p.addedBy && esc(p.addedBy), spentAt(p.id) && '💰 ' + won(spentAt(p.id))].filter(Boolean).join(' · ')}</div>
          ${p.memo ? `<div class="memo">${esc(p.memo)}</div>` : ''}
        </div>
        <div class="pact"><a class="btn ghost small" href="${mapsLink(p)}" target="_blank" rel="noopener">지도</a>
          <button class="btn ghost small" data-spend="${esc(p.id)}" title="여기서 쓴 돈 기록">＋💰</button></div>
      </div>`).join('')}
    </div>`).join('') || '<div class="card note">아직 기록한 장소가 없어요. 맛집·카페·관광지를 남겨 보세요.</div>'}`;
  if ($('pDays')) $('pDays').querySelectorAll('[data-day]').forEach(b => b.onclick = () => { placeDayFilter = b.dataset.day; renderJourney(); });
  $('pAdd').onclick = () => { editingPlace = newPlace(i); renderJourney(); };
  if ($('pNear')) $('pNear').onclick = () => nearbyPlaces(i);
  $('jBody').querySelectorAll('[data-place]').forEach(el => el.onclick = () => { editingPlace = Object.assign({}, all.find(p => p.id === el.dataset.place)); renderJourney(); });
  $('jBody').querySelectorAll('[data-spend]').forEach(b => b.onclick = () => {
    const p = all.find(x => x.id === b.dataset.spend);
    editingExpense = newExpense(i, { placeId: p.id, title: p.name, category: placeCat(p.category).exp, paidOn: p.visitedOn || todayIso() });
    journeySub = 'money'; renderJourney();
  });
  if (CFG.googleMapsKey) drawPlacesMap(shown, i);
}

async function drawPlacesMap(list, i) {
  let maps;
  try { maps = await loadGoogleMaps(); } catch (e) { if ($('jMap')) $('jMap').innerHTML = `<div class="note" style="padding:20px">${esc(e.message)}</div>`; return; }
  const el = $('jMap');
  if (!el) return;
  const withLoc = list.filter(p => p.lat != null && p.lng != null);
  const map = new maps.Map(el, { center: withLoc[0] ? { lat: withLoc[0].lat, lng: withLoc[0].lng } : { lat: 37.5665, lng: 126.978 },
    zoom: withLoc.length ? 14 : 3, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: 'cooperative' });
  if (!withLoc.length) return;
  const bounds = new maps.LatLngBounds();
  const info = new maps.InfoWindow();
  withLoc.forEach(p => {
    const c = placeCat(p.category);
    const m = new maps.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.name,
      label: { text: c.emoji, fontSize: '14px' },
      icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: c.color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } });
    m.addListener('click', () => { info.setContent(`<b>${esc(p.name)}</b><br>${c.emoji} ${c.name}${p.rating ? ' · ' + '★'.repeat(p.rating) : ''}<br><a href="${mapsLink(p)}" target="_blank" rel="noopener">구글맵에서 열기</a>`); info.open({ map, anchor: m }); });
    bounds.extend({ lat: p.lat, lng: p.lng });
  });
  if (withLoc.length > 1) map.fitBounds(bounds, 40);
}

function newPlace(i, extra) {
  const today = todayIso();
  const me = store.get('famLastAddedBy');
  return Object.assign({ id: newId(), journeyId: i.journey.id, isNew: true,
    visitedOn: today >= i.dep && today <= (i.ret || i.dep) ? today : i.dep, name: '', category: 'food', googlePlaceId: '',
    lat: null, lng: null, address: '', rating: null, memo: '', addedBy: i.people.includes(me) ? me : (i.people[0] || '') }, extra || {});
}

/** 구글 장소 → 우리 장소 칸 채우기 (필드는 필요한 것만 요청: 이름·주소·위치·지도링크) */
async function fillFromGooglePlace(place) {
  await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'] });
  const e = editingPlace;
  e.name = place.displayName || e.name; e.address = place.formattedAddress || ''; e.googlePlaceId = place.id || '';
  if (place.location) { e.lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat; e.lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng; }
  const t = place.types || [];
  if (e.category === 'food' || e.isNew) {
    if (t.some(x => /cafe|coffee|bakery/.test(x))) e.category = 'cafe';
    else if (t.some(x => /bar|pub|night_club|winery/.test(x))) e.category = 'bar';
    else if (t.some(x => /restaurant|food/.test(x))) e.category = 'food';
    else if (t.some(x => /lodging|hotel|resort/.test(x))) e.category = 'stay';
    else if (t.some(x => /store|mall|market|shopping/.test(x))) e.category = 'shopping';
    else if (t.some(x => /tourist|museum|park|temple|church|landmark|zoo|aquarium|point_of_interest/.test(x))) e.category = 'sight';
  }
}

function renderPlaceForm(i) {
  const p = editingPlace;
  $('jBody').innerHTML = `
    <div class="card">
      <h3 class="ch">${p.isNew ? '＋ 장소 추가' : '장소 수정'}</h3>
      ${CFG.googleMapsKey ? `<label>구글에서 찾기</label><div id="pSearch" class="psearch"><span class="note">검색창 불러오는 중…</span></div>` : ''}
      <label>이름</label><input type="text" id="pName" value="${esc(p.name)}" placeholder="예: 이치란 라멘 하카타점">
      ${p.address ? `<div class="note">📍 ${esc(p.address)}</div>` : ''}
      <label>종류</label>
      <div class="filters" id="pCat">${PLACE_CATS.map(c => `<button class="pill ${p.category === c.key ? 'on' : ''}" data-cat="${c.key}">${c.emoji} ${c.name}</button>`).join('')}</div>
      <div class="row2">
        <div><label>간 날</label><input type="date" id="pDate" value="${esc(p.visitedOn)}"></div>
        <div><label>기록한 사람</label><select id="pBy">${i.participants.map(x => `<option ${x === p.addedBy ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      </div>
      <label>우리 가족 별점</label>
      <div class="rate" id="pRate">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}" class="${p.rating >= n ? 'on' : ''}" aria-label="${n}점">★</button>`).join('')}<button data-r="0" class="clear">지우기</button></div>
      <label>메모</label><textarea id="pMemo" rows="2" placeholder="예: 돈코츠 진한 맛, 웨이팅 30분">${esc(p.memo)}</textarea>
      <div class="actions">
        <button class="btn" id="pSave">저장</button>
        <button class="btn ghost" id="pCancel">취소</button>
        ${p.isNew ? '' : '<button class="btn danger" id="pDel">삭제</button>'}
      </div>
    </div>`;
  const read = () => { p.name = $('pName').value.trim(); p.visitedOn = $('pDate').value; p.addedBy = $('pBy').value; p.memo = $('pMemo').value.trim(); };
  $('pCat').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { read(); p.category = b.dataset.cat; renderPlaceForm(i); });
  $('pRate').querySelectorAll('[data-r]').forEach(b => b.onclick = () => { read(); p.rating = Number(b.dataset.r) || null; renderPlaceForm(i); });
  $('pCancel').onclick = () => { editingPlace = null; renderJourney(); };
  if ($('pDel')) $('pDel').onclick = () => {
    if (!confirm('이 장소를 삭제할까요?')) return;
    DATA.places = DATA.places.filter(x => x.id !== p.id); removeRow('places', p.id);
    DATA.expenses.filter(e => e.placeId === p.id).forEach(e => { e.placeId = ''; saveRows('expenses', [expenseToRow(e)]); });
    editingPlace = null; afterLocalChange(); toast('삭제했어요');
  };
  $('pSave').onclick = () => {
    read();
    if (!p.name) return toast('장소 이름을 넣어 주세요');
    const saved = Object.assign({}, p); delete saved.isNew;
    DATA.places = (DATA.places || []).filter(x => x.id !== saved.id).concat(saved);
    saveRows('places', [placeToRow(saved)]); store.set('famLastAddedBy', saved.addedBy);
    editingPlace = null; afterLocalChange(); toast('저장했어요 📍');
  };
  if (CFG.googleMapsKey) mountPlaceSearch(i, read);
}

/** 구글 장소 자동완성 (Places API (New)의 PlaceAutocompleteElement). 여행 나라 안에서 먼저 찾음 */
async function mountPlaceSearch(i, read) {
  const box = $('pSearch');
  try {
    await loadGoogleMaps();
    const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
    if (!$('pSearch')) return;
    const codes = i.countries.map(c => c.code).filter(c => /^[A-Z]{2}$/.test(c)).slice(0, 15).map(c => c.toLowerCase());
    const el = new PlaceAutocompleteElement(codes.length ? { includedRegionCodes: codes } : {});
    box.innerHTML = ''; box.appendChild(el);
    const pick = async place => { read(); await fillFromGooglePlace(place); renderPlaceForm(i); };
    el.addEventListener('gmp-select', async ev => pick(ev.placePrediction.toPlace()));
    el.addEventListener('gmp-placeselect', async ev => pick(ev.place));   // 예전 이름의 이벤트
  } catch (e) { if (box) box.innerHTML = `<span class="note">${esc(e.message || '검색을 쓸 수 없어요')} · 이름을 직접 써 주세요</span>`; }
}

/** 📍 지금 여기 근처: 휴대폰 위치로 주변 장소 찾아 고르기 */
async function nearbyPlaces(i) {
  if (!navigator.geolocation) return toast('이 기기에서는 위치를 쓸 수 없어요');
  toast('현재 위치 찾는 중…');
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      await loadGoogleMaps();
      const { Place } = await google.maps.importLibrary('places');
      const { places } = await Place.searchNearby({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
        locationRestriction: { center: { lat: pos.coords.latitude, lng: pos.coords.longitude }, radius: 150 },
        maxResultCount: 10, language: 'ko',
      });
      if (!places || !places.length) return toast('근처에서 찾은 장소가 없어요');
      $('jBody').insertAdjacentHTML('afterbegin', `<div class="card" id="nearBox"><h3 class="ch">📍 지금 여기 근처</h3>
        ${places.map((pl, k) => `<div class="erow" data-near="${k}" style="cursor:pointer"><div style="flex:1"><b>${esc(pl.displayName)}</b><div class="who">${esc(pl.formattedAddress || '')}</div></div><span class="btn small">고르기</span></div>`).join('')}
        <div class="actions"><button class="btn ghost" id="nearClose">닫기</button></div></div>`);
      $('nearClose').onclick = () => $('nearBox').remove();
      $('jBody').querySelectorAll('[data-near]').forEach(el => el.onclick = async () => {
        editingPlace = newPlace(i, { visitedOn: todayIso() });
        await fillFromGooglePlace(places[Number(el.dataset.near)]);
        renderJourney();
      });
    } catch (e) { toast('근처 장소를 못 찾았어요: ' + e.message); }
  }, () => toast('위치 권한을 허용해 주세요'), { enableHighAccuracy: true, timeout: 15000 });
}

/* ── 💸 정산 ── */
/** 낸 돈·내 몫·차액, 그리고 최소 송금 목록 (개인 지출은 빼고). 원 단위로 반올림 */
function computeSettlement(i) {
  const ex = (DATA.expenses || []).filter(e => e.journeyId === i.journey.id);
  const people = i.participants.slice();
  ex.forEach(e => { [e.payer].concat(e.split).forEach(p => { if (p && !people.includes(p)) people.push(p); }); });
  const paid = {}, share = {};
  people.forEach(p => { paid[p] = 0; share[p] = 0; });
  let personalTotal = 0;
  ex.forEach(e => {
    if (e.personal) { personalTotal += e.krw; return; }
    const split = e.split.length ? e.split : i.participants;
    if (e.payer) paid[e.payer] += e.krw;
    split.forEach(p => { share[p] += e.krw / split.length; });
  });
  const rows = people.map(p => ({ name: p, paid: Math.round(paid[p]), share: Math.round(share[p]), diff: Math.round(paid[p] - share[p]) }))
    .filter(r => r.paid || r.share);
  const debt = rows.filter(r => r.diff < 0).map(r => ({ name: r.name, left: -r.diff })).sort((a, b) => b.left - a.left);
  const cred = rows.filter(r => r.diff > 0).map(r => ({ name: r.name, left: r.diff })).sort((a, b) => b.left - a.left);
  const transfers = [];
  for (const d of debt) {
    for (const c of cred) {
      if (d.left <= 0) break;
      const amt = Math.min(d.left, c.left);
      if (amt >= 1) { transfers.push({ from: d.name, to: c.name, amount: amt }); d.left -= amt; c.left -= amt; }
    }
  }
  return { rows, transfers, personalTotal, total: ex.reduce((n, e) => n + e.krw, 0) };
}

function renderSettle(i) {
  const s = computeSettlement(i);
  const checks = (DATA.checks || []).filter(c => c.journeyId === i.journey.id);
  const doneN = s.transfers.filter(t => { const c = checks.find(x => x.from === t.from && x.to === t.to); return c && Math.abs(c.amount - t.amount) < 1; }).length;
  $('jBody').innerHTML = `
    <div class="card">
      <h3 class="ch">💸 정산 <span class="note">총 ${won(s.total)}${s.personalTotal ? ` · 개인 지출 ${won(s.personalTotal)} 제외` : ''}</span></h3>
      ${s.rows.length ? `<div style="overflow-x:auto"><table>
        <tr><th>사람</th><th class="c">낸 돈</th><th class="c">내 몫</th><th class="c">차액</th></tr>
        ${s.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="c">${won(r.paid)}</td><td class="c">${won(r.share)}</td>
          <td class="c"><b style="color:${r.diff > 0 ? '#1e7b3a' : r.diff < 0 ? 'var(--danger)' : 'inherit'}">${r.diff > 0 ? '+' : ''}${won(r.diff)}</b></td></tr>`).join('')}
      </table></div>
      <div class="note">+ 는 받을 돈, − 는 보낼 돈이에요. "함께 쓴 사람"끼리 똑같이 나눠요.</div>` : '<div class="note">정산할 지출이 없어요.</div>'}
    </div>
    <div class="card">
      <h3 class="ch">✅ 정산 체크리스트 ${s.transfers.length ? `<span class="note">${doneN}/${s.transfers.length} 완료</span>` : ''}</h3>
      ${s.transfers.map(t => {
        const id = [i.journey.id, t.from, t.to].join('|');
        const c = checks.find(x => x.id === id);
        const done = c && Math.abs(c.amount - t.amount) < 1;
        return `<label class="settle ${done ? 'done' : ''}"><input type="checkbox" data-check="${esc(id)}" data-from="${esc(t.from)}" data-to="${esc(t.to)}" data-amt="${t.amount}" ${done ? 'checked' : ''}>
          <span><b>${esc(t.from)}</b> → <b>${esc(t.to)}</b> ${won(t.amount)}
          ${c && !done ? `<span class="tag warn">금액이 바뀌었어요 (체크 때 ${won(c.amount)})</span>` : ''}${done ? ` <span class="note">${String(c.checkedAt).slice(5, 10).replace('-', '/')} 보냄</span>` : ''}</span></label>`;
      }).join('') || '<div class="note">보낼 돈이 없어요 🎉</div>'}
    </div>`;
  $('jBody').querySelectorAll('[data-check]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.check;
    DATA.checks = (DATA.checks || []).filter(c => c.id !== id);
    if (cb.checked) {
      const c = { id, journeyId: i.journey.id, from: cb.dataset.from, to: cb.dataset.to, amount: Number(cb.dataset.amt), checkedAt: new Date().toISOString() };
      DATA.checks.push(c); saveRows('settle_checks', [checkToRow(c)]);
    } else removeRow('settle_checks', id);
    afterLocalChange();
  });
}

/* ───────── 통계: 여행별 지출 ───────── */
function renderSpendStats() {
  const el = $('spendCard');
  if (!el) return;
  const items = (DATA.journeys || []).map(journeyInfo).filter(i => i.members.length)
    .map(i => Object.assign(i, { spend: (DATA.expenses || []).filter(e => e.journeyId === i.journey.id).reduce((n, e) => n + e.krw, 0) }))
    .filter(i => i.spend).sort((a, b) => (a.dep < b.dep ? 1 : -1));
  el.classList.toggle('hidden', !items.length);
  if (!items.length) return;
  const byYear = {};
  (DATA.expenses || []).forEach(e => { const y = e.paidOn.slice(0, 4); byYear[y] = (byYear[y] || 0) + e.krw; });
  el.innerHTML = `<h3 style="margin-top:0">💰 여행별 지출</h3>
    <table><tr><th>여행</th><th class="c">총지출</th><th class="c">1인당</th></tr>
    ${items.map(i => `<tr class="jlink" data-jid="${esc(i.journey.id)}"><td>${esc(i.title)}<div class="who">${dot(i.dep)} · ${i.participants.length}명</div></td>
      <td class="c"><b>${won(i.spend)}</b></td><td class="c">${won(i.spend / Math.max(i.participants.length, 1))}</td></tr>`).join('')}
    </table>
    <div class="note">연도별 (결제일 기준): ${Object.keys(byYear).sort().reverse().map(y => `${y}년 ${won(byYear[y])}`).join(' · ')}</div>`;
  el.querySelectorAll('[data-jid]').forEach(r => r.onclick = () => openJourney(r.dataset.jid, 'money'));
}

/* ───────── 가계부 내려받기 (CSV) ───────── */
function exportExpensesCsv() {
  const ex = (DATA.expenses || []).slice().sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1));
  if (!ex.length) return toast('내려받을 가계부가 없어요');
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const title = id => { const j = getJourney(id); return j ? journeyInfo(j).title : ''; };
  const place = id => { const p = (DATA.places || []).find(x => x.id === id); return p ? p.name : ''; };
  const head = ['여행', '결제일', '종류', '내용', '금액', '통화', '환율', '원화', '카드청구액', '결제한 사람', '결제수단', '함께 쓴 사람', '개인 지출', '장소', '메모'];
  const lines = ex.map(e => [title(e.journeyId), e.paidOn, expCat(e.category).name, e.title, e.amount, e.currency, e.fxRate, e.krw,
    e.krwManual ? 'Y' : '', e.payer, e.method, e.split.join(', '), e.personal ? 'Y' : '', place(e.placeId), e.memo].map(q).join(','));
  const blob = new Blob(['﻿' + [head.map(q).join(',')].concat(lines).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `family-expenses_${todayIso().replace(/-/g, '')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`지출 ${ex.length}건을 내려받았어요`);
}
