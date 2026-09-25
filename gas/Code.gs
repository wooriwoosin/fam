/**
 * 우리 가족 해외여행 기록장
 *
 * 시트 구성
 *  - 여행기록 : 한 번 출국할 때마다 한 줄 (가족이 같이 가면 사람마다 한 줄씩)
 *               방문도시는 '오사카(일본), 교토(일본)'처럼 도시(나라) 형식으로 저장
 *  - 통계     : 사람별 출국 횟수 / 나라·도시 방문 횟수 / 가본 나라·도시 수, 연도별 출국 횟수
 *  - 나라별   : 나라마다 누가 몇 번 갔는지, 어느 도시에 갔는지 (국기 이미지 포함)
 *  - 국가목록 : 나라 이름 ↔ 국기 매칭표 (없는 나라는 여기에 한 줄 추가)
 *
 * 화면(index.html)은 GitHub Pages에 두고, 이 스크립트는 시트 저장/조회 API 역할만 합니다.
 * 처음 한 번만 편집기에서 setFamilyKey → setup 순서로 실행하세요.
 *
 * 속도: 시트 호출 한 번이 수십~수백 ms라서, 요청마다 여행기록을 '한 번 읽고 → 메모리에서 고치고 → 한 번에 씀'.
 *       국가목록은 CacheService에 캐시하고, 통계 시트는 값만 한 번에 씁니다 (서식은 setup 때 한 번만).
 */

const SPREADSHEET_ID = '14vG4qi62Nkl0ytk8ozNpuD75Puf9XDKjoLsFQ5E7tHA';

const FAMILY = [
  { name: '전정순', role: '엄마' },
  { name: '허인선', role: '시스터' },
  { name: '허형준', role: '남편' },
  { name: '김민정', role: '나' },
];

const SHEET = {
  TRIPS: '여행기록',
  STATS: '통계',
  BY_COUNTRY: '나라별',
  COUNTRIES: '국가목록',
};

const TRIP_HEADERS = ['ID', '여행자', '출국일', '입국일', '기간', '방문국가', '방문도시', '국기', '나라 수', '도시 수', '메모'];
const COL = { ID: 1, PERSON: 2, DEP: 3, RET: 4, DAYS: 5, COUNTRIES: 6, CITIES: 7, FLAGS: 8, COUNT: 9, CITY_COUNT: 10, MEMO: 11 };
// 예전 버전 시트에 없던 열. ensureTripColumns_가 제자리에 끼워 넣습니다.
const ADDED_COLUMNS = ['방문도시', '도시 수'];

const COUNTRY_HEADERS = ['국가', '코드', '국기', '국기 이미지', '별칭 (| 로 구분)'];

const DATE_FORMAT = 'yyyy.mm.dd';
const MISSING_COLOR = '#fff4c2';
const UNKNOWN_COLOR = '#ffd6d6';
const COUNTRY_CACHE_KEY = 'countryRows_v1';
// 'get' 응답 전체를 캐시 (저장할 때마다 새로 채움)
//  1순위 CacheService (가장 빠름, 최대 6시간이면 사라짐)
//  2순위 스크립트 속성 스냅샷 (사라지지 않음 → 밤새 캐시가 비어도 아침 첫 불러오기에서 시트를 안 엶)
const APP_CACHE_KEY = 'appData_v1';
const SNAPSHOT_KEY = 'snap';
const CACHE_SECONDS = 6 * 60 * 60;

// 통계 시트 고정 배치 (가족 수가 정해져 있어서 위치가 바뀌지 않음 → 서식은 한 번만)
const STATS_HEADER = ['여행자', '출국 횟수', '나라 방문 횟수', '가본 나라 수', '도시 방문 횟수', '가본 도시 수',
  '총 여행일수', '최근 출국', '나라 미입력', '가본 나라 · 도시'];
const STATS_TABLE_ROW = 4;
const STATS_YEAR_ROW = STATS_TABLE_ROW + FAMILY.length + 2;

/* ───────────────────────── 설치 ───────────────────────── */

/** 처음 한 번 실행: 시트 만들기 + 국가목록 채우기 + 자동 국기·새벽 새로고침 트리거 + 통계 서식 */
function setup() {
  const ss = getSpreadsheet_();
  setupTripSheet_(ss);
  setupCountrySheet_(ss);
  formatStatsSheet_(getOrCreateSheet_(ss, SHEET.STATS));
  formatByCountrySheet_(getOrCreateSheet_(ss, SHEET.BY_COUNTRY));
  installEditTrigger_(ss);
  CacheService.getScriptCache().remove(COUNTRY_CACHE_KEY);
  lookupCache_ = null;
  refreshAll();
}

function setupTripSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET.TRIPS);
  ensureTripColumns_(ss);
  sheet.getRange(1, 1, 1, TRIP_HEADERS.length).setValues([TRIP_HEADERS])
    .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.hideColumns(COL.ID);
  const max = sheet.getMaxRows();
  sheet.getRange(2, COL.PERSON, max - 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(FAMILY.map(f => f.name), true).build());
  sheet.getRange(2, COL.DEP, max - 1, 2).setNumberFormat(DATE_FORMAT);
  sheet.getRange(2, COL.FLAGS, max - 1).setFontSize(16);
  sheet.setColumnWidth(COL.PERSON, 80);
  sheet.setColumnWidths(COL.DEP, 2, 95);
  sheet.setColumnWidth(COL.DAYS, 70);
  sheet.setColumnWidth(COL.COUNTRIES, 180);
  sheet.setColumnWidth(COL.CITIES, 240);
  sheet.setColumnWidth(COL.FLAGS, 120);
  sheet.setColumnWidths(COL.COUNT, 2, 60);
  sheet.setColumnWidth(COL.MEMO, 200);
  sheet.getRange(1, COL.COUNTRIES).setNote('나라 이름을 쉼표로 구분해서 입력하세요. 예) 일본, 태국\n도시 이름(다낭, 발리 등)을 쓰면 나라와 도시로 알아서 나눠줍니다.');
  sheet.getRange(1, COL.CITIES).setNote('도시를 쉼표로 구분해서 입력하세요. 예) 오사카, 교토, 방콕\n목록에 없는 도시는 어느 나라인지 오사카(일본)처럼 괄호로 적어 주세요.');
}

function setupCountrySheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET.COUNTRIES);
  if (sheet.getLastRow() > 1) return; // 사용자가 추가한 내용 보존
  sheet.getRange(1, 1, 1, COUNTRY_HEADERS.length).setValues([COUNTRY_HEADERS])
    .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  const rows = COUNTRY_DATA.map(line => {
    const [code, names] = line.split(':');
    const [name, ...aliases] = names.split('|');
    return [name, code, flagEmoji_(code), flagImageFormula_(code), aliases.join('|')];
  });
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(2, 3, rows.length).setFontSize(16);
  sheet.setColumnWidth(5, 400);
  sheet.getRange(1, 2).setNote('ISO 2자리 국가코드 (예: JP). 새 나라를 추가할 때는 국가·코드만 쓰면 국기는 자동으로 채워집니다.');
}

/** 통계 시트 서식 (setup 때 한 번만) */
function formatStatsSheet_(sheet) {
  sheet.clear();
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  sheet.getRange(2, 1).setFontColor('#666666');
  sheet.getRange(STATS_TABLE_ROW, 1, 1, STATS_HEADER.length)
    .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.getRange(STATS_TABLE_ROW + 1, 2, FAMILY.length, 5)
    .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sheet.getRange(STATS_YEAR_ROW, 1).setFontWeight('bold');
  sheet.getRange(STATS_YEAR_ROW + 1, 1, 1, FAMILY.length + 1).setFontWeight('bold').setBackground('#dbe9f6');
  sheet.getRange(STATS_YEAR_ROW + 2, 1, 100, FAMILY.length + 1).setHorizontalAlignment('center');
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidths(2, 8, 95);
  sheet.setColumnWidth(10, 700);
}

/** 나라별 시트 서식 (setup 때 한 번만) */
function formatByCountrySheet_(sheet) {
  sheet.clear();
  const width = 3 + FAMILY.length + 2;
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 2, 250).setFontSize(16);
  sheet.getRange(2, 4, 250, FAMILY.length + 1).setHorizontalAlignment('center');
  sheet.setRowHeights(2, 250, 28);
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(2, 40);
  sheet.setColumnWidth(width, 400);
}

/** 예전 시트(방문도시·도시 수 열이 없던 버전)를 새 열 구성으로 맞춤. 여러 번 불러도 안전 */
function ensureTripColumns_(ss) {
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  if (!sheet || sheet.getLastColumn() === 0) return false;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (header[0] !== 'ID') return false;
  let changed = false;
  TRIP_HEADERS.forEach((h, i) => {
    if (header[i] === h || ADDED_COLUMNS.indexOf(h) < 0) return;
    sheet.insertColumnBefore(i + 1);
    header.splice(i, 0, h);
    changed = true;
  });
  if (changed) sheet.getRange(1, 1, 1, TRIP_HEADERS.length).setValues([TRIP_HEADERS]);
  return changed;
}

function installEditTrigger_(ss) {
  const handlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (handlers.indexOf('handleEdit') < 0) ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  // 매일 새벽 5시쯤 스냅샷 새로 고침 (서울 시간 기준, appsscript.json 시간대)
  if (handlers.indexOf('refreshSnapshot') < 0) ScriptApp.newTrigger('refreshSnapshot').timeBased().everyDays(1).atHour(5).create();
}

/* ───────────────────────── 여행기록 저장소 (한 번 읽고 한 번 쓰기) ───────────────────────── */

/** 여행기록 시트 전체를 한 번에 읽음 → { sheet, rows: [[...11칸]], oldCount } */
function loadStore_(ss) {
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  if (!sheet) throw new Error('편집기에서 setup을 먼저 실행해 주세요');
  let values = sheet.getDataRange().getValues();
  if (values[0] && values[0][0] === 'ID' && TRIP_HEADERS.some((h, i) => values[0][i] !== h)) {
    if (ensureTripColumns_(ss)) values = sheet.getDataRange().getValues();  // 예전 시트면 한 번만 열 추가
  }
  const width = TRIP_HEADERS.length;
  const rows = values.slice(1)
    .map(r => { const row = r.slice(0, width); while (row.length < width) row.push(''); return row; })
    .filter(r => r.some(v => v !== '' && v !== null));
  return { sheet: sheet, rows: rows, oldCount: Math.max(values.length - 1, 0) };
}

/**
 * 모든 줄의 계산 칸(기간·국기·나라 수 등)을 채우고 출국일 최신순으로 정렬한 뒤 한 번에 씀.
 * 시트 호출: 값 1번 + 배경색 1번 + 메모 1번 (+ 줄이 줄었으면 지우기 1번)
 */
function saveStore_(store, lookup) {
  const width = TRIP_HEADERS.length;
  const done = store.rows.map(r => normalizeRow_(r, lookup));
  const time = d => { const x = parseDate_(d.values[COL.DEP - 1]); return x ? x.getTime() : 0; };
  done.sort((a, b) => time(b) - time(a) ||
    String(a.values[COL.PERSON - 1]).localeCompare(String(b.values[COL.PERSON - 1]), 'ko'));
  const n = done.length;
  const total = Math.max(n, store.oldCount);
  if (n) store.sheet.getRange(2, 1, n, width).setValues(done.map(d => d.values));
  if (store.oldCount > n) store.sheet.getRange(2 + n, 1, store.oldCount - n, width).clearContent();
  if (total) {
    const marks = store.sheet.getRange(2, COL.COUNTRIES, total, 2);
    const pad = (arr, empty) => arr.concat(Array.from({ length: total - n }, () => empty));
    marks.setBackgrounds(pad(done.map(d => d.backgrounds), [null, null]));
    marks.setNotes(pad(done.map(d => d.notes), ['', '']));
  }
  store.rows = done.map(d => d.values);
  store.oldCount = n;
  return store.rows;
}

/** 한 줄(값 배열) → 계산 칸을 채운 값 + 방문국가/방문도시 칸의 배경색·메모 (시트 호출 없음) */
function normalizeRow_(row, lookup) {
  const v = row.slice();
  const dep = parseDate_(v[COL.DEP - 1]);
  const ret = parseDate_(v[COL.RET - 1]);
  if (!v[COL.ID - 1]) v[COL.ID - 1] = newId_();
  v[COL.PERSON - 1] = String(v[COL.PERSON - 1]).trim();
  v[COL.DEP - 1] = dep || v[COL.DEP - 1];
  v[COL.RET - 1] = ret || v[COL.RET - 1];
  v[COL.DAYS - 1] = durationLabel_(dep, ret);

  const parsed = parseTrip_(String(v[COL.COUNTRIES - 1]).trim(), String(v[COL.CITIES - 1]).trim(), lookup);
  const texts = tripTexts_(parsed.countries);
  v[COL.COUNTRIES - 1] = texts.countries;
  v[COL.CITIES - 1] = [texts.cities].concat(parsed.unknownCities).filter(Boolean).join(', ');
  v[COL.FLAGS - 1] = parsed.countries.map(c => c.code ? flagEmoji_(c.code) : '❓').join(' ');
  v[COL.COUNT - 1] = parsed.countries.length || '';
  v[COL.CITY_COUNT - 1] = countCities_(parsed.countries) || '';

  let countryBg = null, countryNote = '';
  if (parsed.unknown.length) {
    countryBg = UNKNOWN_COLOR;
    countryNote = '국가목록에 없는 이름: ' + parsed.unknown.join(', ') + '\n국가목록 탭에 추가하거나 별칭을 등록하세요.';
  } else if (!parsed.countries.length) {
    countryBg = MISSING_COLOR;
    countryNote = '나라를 입력해 주세요';
  }
  let cityBg = null, cityNote = '';
  if (parsed.unknownCities.length) {
    cityBg = UNKNOWN_COLOR;
    cityNote = '어느 나라 도시인지 모르겠어요: ' + parsed.unknownCities.join(', ') + '\n오사카(일본)처럼 괄호 안에 나라를 적어 주세요.';
  }
  return { values: v, backgrounds: [countryBg, cityBg], notes: [countryNote, cityNote], countries: parsed.countries };
}

/** 저장된 한 줄 → 화면용 여행 객체 */
function tripFromRow_(v, lookup) {
  const dep = parseDate_(v[COL.DEP - 1]);
  const ret = parseDate_(v[COL.RET - 1]);
  return {
    id: String(v[COL.ID - 1]),
    person: String(v[COL.PERSON - 1]).trim(),
    dep: formatIso_(dep),
    ret: formatIso_(ret),
    days: dep && ret ? daysBetween_(dep, ret) + 1 : 0,
    countries: parseTrip_(String(v[COL.COUNTRIES - 1]), String(v[COL.CITIES - 1]), lookup).countries,
    memo: String(v[COL.MEMO - 1]),
  };
}

function tripsFromRows_(rows, lookup) {
  return rows.map(r => tripFromRow_(r, lookup)).filter(t => t.person)
    .sort((a, b) => (a.dep < b.dep ? 1 : a.dep > b.dep ? -1 : 0));
}

function newRow_(fields) {
  const row = new Array(TRIP_HEADERS.length).fill('');
  Object.keys(fields).forEach(k => { row[COL[k] - 1] = fields[k]; });
  return row;
}

/* ───────────────────────── 시트에서 직접 편집할 때 ───────────────────────── */

/** 설치형 onEdit 트리거: 여행기록/국가목록이 바뀌면 국기·기간·통계를 다시 계산 */
function handleEdit(e) {
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const ss = sheet.getParent();
  if (name === SHEET.COUNTRIES) {
    CacheService.getScriptCache().remove(COUNTRY_CACHE_KEY);
    lookupCache_ = null;
    fillCountryFlags_(sheet);
    refreshAll();
  } else if (name === SHEET.TRIPS && e.range.getLastRow() > 1) {
    if (ensureTripColumns_(ss)) { refreshAll(); return; }
    const lookup = buildLookup_(ss);
    const first = Math.max(2, e.range.getRow());
    const count = e.range.getLastRow() - first + 1;
    const range = sheet.getRange(first, 1, count, TRIP_HEADERS.length);
    const rows = range.getValues();
    const done = rows.map(r => r.some(v => v !== '' && v !== null) ? normalizeRow_(r, lookup) : null);
    range.setValues(done.map((d, i) => d ? d.values : rows[i]));
    const marks = sheet.getRange(first, COL.COUNTRIES, count, 2);
    marks.setBackgrounds(done.map(d => d ? d.backgrounds : [null, null]));
    marks.setNotes(done.map(d => d ? d.notes : ['', '']));
    const store = loadStore_(ss);
    const trips = tripsFromRows_(store.rows, lookup);
    cacheAppData_(lookup, trips, rebuildStats_(ss, trips));
  }
}

/** 메뉴/수동 실행용: 모든 줄의 국기·기간과 통계를 새로 계산 */
function refreshAll() {
  const ss = getSpreadsheet_();
  const lookup = buildLookup_(ss);
  const store = loadStore_(ss);
  saveStore_(store, lookup);
  const trips = tripsFromRows_(store.rows, lookup);
  cacheAppData_(lookup, trips, rebuildStats_(ss, trips));
}

/** 매일 새벽 트리거: 시트에서 다시 읽어 스냅샷을 최신으로 (시트를 직접 고친 게 빠졌어도 하루 안에 맞춰짐) */
function refreshSnapshot() {
  const ss = getSpreadsheet_();
  const lookup = buildLookup_(ss);
  const trips = tripsFromRows_(loadStore_(ss).rows, lookup);
  cacheAppData_(lookup, trips, computeStats_(trips));
}

/** 메뉴: 메모에 적어 둔 도시 이름을 '방문도시' 칸으로 옮김 (목록에 있는 도시만, 나머지 메모는 그대로) */
function moveMemoCities() {
  const ss = getSpreadsheet_();
  const lookup = buildLookup_(ss);
  const store = loadStore_(ss);
  let moved = 0;
  store.rows.forEach(r => {
    const { found, rest } = splitMemoCities_(String(r[COL.MEMO - 1]), lookup);
    if (!found.length) return;
    r[COL.CITIES - 1] = [String(r[COL.CITIES - 1]).trim()].concat(found).filter(Boolean).join(', ');
    r[COL.MEMO - 1] = rest;
    moved += found.length;
  });
  saveStore_(store, lookup);
  const trips = tripsFromRows_(store.rows, lookup);
  cacheAppData_(lookup, trips, rebuildStats_(ss, trips));
  const msg = '메모에서 도시 ' + moved + '개를 방문도시로 옮겼어요.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/** '오사카, 교토 가족여행' → { found: ['오사카(일본)', '교토(일본)'], rest: '가족여행' } */
function splitMemoCities_(memo, lookup) {
  const found = [];
  const rest = String(memo).split(/([,，、/·\s]+)/).filter(tok => {
    const city = lookup.cityByKey[normKey_(tok)];
    if (!tok.trim() || !city || lookup.countryByKey[normKey_(tok)]) return true;
    found.push(city.name + '(' + city.country + ')');
    return false;
  }).join('').replace(/([,，、/·]\s*){2,}/g, ', ').replace(/^[,，、/·\s]+|[,，、/·\s]+$/g, '');
  return { found: found, rest: rest };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('✈️ 여행기록')
    .addItem('국기·통계 새로고침', 'refreshAll')
    .addItem('메모의 도시 → 방문도시로 옮기기', 'moveMemoCities')
    .addItem('처음 설정 (setup)', 'setup')
    .addToUi();
}

function fillCountryFlags_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const range = sheet.getRange(2, 1, last - 1, 4);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    const code = String(row[1]).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (!row[2]) { row[2] = flagEmoji_(code); changed = true; }
    if (!row[3]) { row[3] = flagImageFormula_(code); changed = true; }
  });
  if (changed) sheet.getRange(2, 3, values.length, 2).setValues(values.map(r => [r[2], r[3]]));
}

/* ───────────────────────── 통계 ───────────────────────── */

/** 통계·나라별 시트를 값만 한 번에 씀 (서식은 setup 때 한 번만 해 둠) */
function rebuildStats_(ss, trips) {
  const stats = computeStats_(trips);
  writeStatsSheet_(ss, stats);
  writeByCountrySheet_(ss, stats);
  return stats;
}

function computeStats_(trips) {
  const people = FAMILY.map(f => {
    const mine = trips.filter(t => t.person === f.name);
    const visitCount = {};   // 나라 → 횟수
    const cityCount = {};    // '도시(나라)' → 횟수
    mine.forEach(t => t.countries.forEach(c => {
      visitCount[c.name] = (visitCount[c.name] || 0) + 1;
      c.cities.forEach(city => { const k = city + '(' + c.name + ')'; cityCount[k] = (cityCount[k] || 0) + 1; });
    }));
    const lastDep = mine.reduce((m, t) => (t.dep > m ? t.dep : m), '');
    return {
      name: f.name,
      role: f.role,
      departures: mine.length,
      countryVisits: mine.reduce((s, t) => s + t.countries.length, 0),
      uniqueCountries: Object.keys(visitCount).length,
      cityVisits: mine.reduce((s, t) => s + countCities_(t.countries), 0),
      uniqueCities: Object.keys(cityCount).length,
      days: mine.reduce((s, t) => s + (t.days || 0), 0),
      missing: mine.filter(t => !t.countries.length).length,
      lastDep: lastDep,
      visitCount: visitCount,
      cityCount: cityCount,
    };
  });

  const countryMap = {};
  trips.forEach(t => t.countries.forEach(c => {
    const e = countryMap[c.name] || (countryMap[c.name] = { name: c.name, code: c.code, total: 0, byPerson: {}, cities: {} });
    e.total++;
    e.byPerson[t.person] = (e.byPerson[t.person] || 0) + 1;
    c.cities.forEach(city => { e.cities[city] = (e.cities[city] || 0) + 1; });
  }));
  const countries = Object.values(countryMap).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'));

  const years = {};
  trips.forEach(t => {
    if (!t.dep) return;
    const y = t.dep.slice(0, 4);
    years[y] = years[y] || {};
    years[y][t.person] = (years[y][t.person] || 0) + 1;
  });

  return { people: people, countries: countries, years: years };
}

/** { 오사카: 2, 교토: 1 } → '오사카×2, 교토' */
function cityListText_(counts) {
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])
    .map(c => c + (counts[c] > 1 ? '×' + counts[c] : '')).join(', ');
}

function writeStatsSheet_(ss, stats) {
  const sheet = getOrCreateSheet_(ss, SHEET.STATS);
  const width = STATS_HEADER.length;
  const blank = () => new Array(width).fill('');
  const line = cells => { const r = blank(); cells.forEach((v, i) => { r[i] = v; }); return r; };

  const grid = [
    line(['👨‍👩‍👧 가족 여행 통계']),
    line(['출국 횟수 = 한국에서 나간 횟수 · 나라/도시 방문 횟수 = 한 번 나가서 여러 곳을 가면 곳마다 1회씩 · 가본 나라/도시 수 = 중복 제외']),
    blank(),
    STATS_HEADER.slice(),
  ];
  stats.people.forEach(p => grid.push([
    p.name + ' (' + p.role + ')',
    p.departures, p.countryVisits, p.uniqueCountries, p.cityVisits, p.uniqueCities, p.days,
    p.lastDep ? p.lastDep.replace(/-/g, '.') : '',
    p.missing ? p.missing + '건' : '',
    Object.keys(p.visitCount).sort((a, b) => p.visitCount[b] - p.visitCount[a]).map(n => {
      const c = stats.countries.find(x => x.name === n);
      const cities = {};
      Object.keys(p.cityCount).forEach(k => {
        const m = k.match(/^(.*)\((.*)\)$/);
        if (m && m[2] === n) cities[m[1]] = p.cityCount[k];
      });
      const cityText = cityListText_(cities);
      return (c && c.code ? flagEmoji_(c.code) : '') + n + (p.visitCount[n] > 1 ? '×' + p.visitCount[n] : '') +
        (cityText ? ' (' + cityText + ')' : '');
    }).join('   '),
  ]));
  grid.push(blank());
  grid.push(line(['📅 연도별 출국 횟수']));
  grid.push(line(['연도'].concat(FAMILY.map(f => f.name))));
  Object.keys(stats.years).sort().reverse()
    .forEach(y => grid.push(line([y].concat(FAMILY.map(f => stats.years[y][f.name] || '')))));

  const old = sheet.getLastRow();
  if (old > grid.length) sheet.getRange(grid.length + 1, 1, old - grid.length, width).clearContent();
  sheet.getRange(1, 1, grid.length, width).setValues(grid);
}

function writeByCountrySheet_(ss, stats) {
  const sheet = getOrCreateSheet_(ss, SHEET.BY_COUNTRY);
  const header = ['국기', '', '나라'].concat(FAMILY.map(f => f.name), ['합계', '다녀온 도시']);
  const grid = [header].concat(stats.countries.map(c => [
    c.code ? flagImageFormula_(c.code) : '',
    c.code ? flagEmoji_(c.code) : '',
    c.name,
  ].concat(FAMILY.map(f => c.byPerson[f.name] || ''), [c.total, cityListText_(c.cities)])));
  const old = sheet.getLastRow();
  if (old > grid.length) sheet.getRange(grid.length + 1, 1, old - grid.length, header.length).clearContent();
  sheet.getRange(1, 1, grid.length, header.length).setValues(grid);
}

/* ───────────────────────── API (GitHub의 index.html이 호출) ───────────────────────── */

/**
 * 화면(HTML)은 GitHub Pages에 있고, 이 스크립트는 시트 저장/조회만 하는 API입니다.
 * 모든 요청은 POST, 본문은 JSON 문자열: { action, key, ... }
 *   action: 'get' | 'add' | 'update' | 'delete' | 'import' | 'ping'
 * key: 가족 비밀번호 (스크립트 속성 FAMILY_KEY). 웹앱을 '모든 사용자'로 공개하므로 이걸로 막습니다.
 * 쓰기 요청의 응답에는 국가·도시 목록을 빼고 trips/stats만 담아서 가볍게 보냅니다.
 */
function doPost(e) {
  return handle_((e && e.postData && e.postData.contents) || '{}');
}

/**
 * GET으로도 같은 요청을 받음: …/exec?p=<JSON>
 * 일부 브라우저·네트워크에서 POST 요청의 리디렉션이 404가 나는 경우가 있어서, 화면이 자동으로 GET으로 바꿔 보냄.
 * p가 없으면(주소를 그냥 열면) 동작 확인 메시지.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.p) return handle_(e.parameter.p);
  return json_({ ok: true, message: '가족 여행기록 API가 동작 중입니다. 화면은 GitHub Pages 주소로 여세요.' });
}

function handle_(raw) {
  try {
    const req = JSON.parse(raw);
    checkKey_(req.key);
    switch (req.action) {
      case 'get': {
        const timing = startTiming_();
        const data = getAppDataJson_(timing);
        return jsonText_('{"ok":true,"timing":' + JSON.stringify(timing.done()) + ',"data":' + data + '}');
      }
      case 'ping': return json_({ ok: true, now: Date.now() });   // 구글 서버 깨우기/연결 확인용 (시트 안 읽음)
      case 'add': return json_(Object.assign({ ok: true }, addTrip_(req.trip || {})));
      case 'update': return json_(Object.assign({ ok: true }, updateTrip_(req.id, req.trip || {})));
      case 'delete': return json_(Object.assign({ ok: true }, deleteTrip_(req.id)));
      case 'import': return json_(Object.assign({ ok: true }, importTrips_(req.person, req.trips || [])));
      default: throw new Error('알 수 없는 요청: ' + req.action);
    }
  } catch (err) {
    return json_({ ok: false, error: err.message, auth: err.name === 'AuthError' });
  }
}

function json_(obj) {
  return jsonText_(JSON.stringify(obj));
}

function jsonText_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** 가족 비밀번호 확인 */
function checkKey_(key) {
  const saved = PropertiesService.getScriptProperties().getProperty('FAMILY_KEY');
  if (!saved) throw new Error('편집기에서 setFamilyKey를 먼저 실행해 주세요');
  if (String(key || '') !== saved) {
    const err = new Error('비밀번호가 틀렸어요');
    err.name = 'AuthError';
    throw err;
  }
}

/** 가족 비밀번호 설정: 아래 값을 바꿔서 편집기에서 실행 (값을 바꾼 뒤 GitHub에는 올리지 마세요) */
function setFamilyKey() {
  const key = '여기에-가족-비밀번호';
  if (key === '여기에-가족-비밀번호') throw new Error('key 값을 원하는 비밀번호로 바꾼 뒤 실행하세요');
  PropertiesService.getScriptProperties().setProperty('FAMILY_KEY', key);
  Logger.log('가족 비밀번호를 저장했습니다. 이제 key 값을 원래대로 되돌려도 됩니다.');
}

/** 처음 불러올 때: 가족, 국가·도시 목록, 여행, 통계. 캐시에 있으면 시트를 아예 안 읽음 */
function getAppDataJson_(timing) {
  timing = timing || startTiming_();
  const hit = cacheGet_(APP_CACHE_KEY);
  timing.step('cache');
  if (hit) { timing.note('cached', true); return hit; }
  const snap = snapshotGet_();
  timing.step('snapshot');
  if (snap) { timing.note('cached', 'snapshot'); cachePut_(APP_CACHE_KEY, snap); return snap; }
  const ss = getSpreadsheet_();
  timing.step('open');
  const lookup = buildLookup_(ss);
  timing.step('countries');
  const store = loadStore_(ss);
  timing.step('readTrips');
  timing.note('rows', store.rows.length);
  const trips = tripsFromRows_(store.rows, lookup);
  const stats = computeStats_(trips);
  timing.step('compute');
  const text = cacheAppData_(lookup, trips, stats);
  timing.step('cachePut');
  return text;
}

/** 단계별 걸린 시간(ms) 기록: 화면 콘솔과 ⚙️ 설정에서 볼 수 있음 */
function startTiming_() {
  const t0 = Date.now();
  let last = t0;
  const out = {};
  return {
    step: name => { const now = Date.now(); out[name] = now - last; last = now; },
    note: (k, v) => { out[k] = v; },
    done: () => { out.total = Date.now() - t0; return out; },
  };
}

/**
 * 편집기에서 실행: 어느 단계가 느린지 '실행 로그'에 찍어 줌.
 * 캐시를 비우고 처음 불러오기와 같은 순서로 재고, 시트 크기도 함께 보여 줌.
 */
function checkSpeed() {
  clearAppCache_();
  CacheService.getScriptCache().remove(COUNTRY_CACHE_KEY);
  const t = startTiming_();
  const ss = getSpreadsheet_();
  t.step('시트 열기');
  ss.getSheets().forEach(sh => {
    Logger.log('%s: 마지막 줄 %s / 전체 %s줄 × %s칸', sh.getName(), sh.getLastRow(), sh.getMaxRows(), sh.getMaxColumns());
  });
  t.step('시트 크기 확인');
  const lookup = buildLookup_(ss);
  t.step('국가목록 읽기');
  const store = loadStore_(ss);
  t.step('여행기록 읽기 (' + store.rows.length + '줄)');
  const trips = tripsFromRows_(store.rows, lookup);
  const stats = computeStats_(trips);
  t.step('계산');
  const text = cacheAppData_(lookup, trips, stats);
  t.step('캐시 저장 (' + Math.round(text.length / 1024) + 'KB)');
  const again = cacheGet_(APP_CACHE_KEY);
  t.step('캐시에서 다시 읽기 (' + (again ? '성공' : '실패') + ')');
  Logger.log(JSON.stringify(t.done(), null, 1));
}

function cacheAppData_(lookup, trips, stats) {
  const text = JSON.stringify({ family: FAMILY, countries: lookup.list, cities: cityData_(), trips: trips, stats: stats });
  cachePut_(APP_CACHE_KEY, text);
  snapshotSave_(text);
  return text;
}

/** CacheService만 비움 (스냅샷은 유지) — checkSpeed에서 시트 읽기 시간을 재려고 */
function clearAppCache_() {
  cacheRemove_(APP_CACHE_KEY);
}

/* 스크립트 속성은 값 하나가 9KB까지라서 2500자(한글 3바이트 기준 ~7.5KB)씩 나눠 저장. 전체 한도 500KB */
const SNAPSHOT_CHUNK = 2500;
function snapshotSave_(text) {
  const props = PropertiesService.getScriptProperties();
  const n = Math.ceil(text.length / SNAPSHOT_CHUNK) || 1;
  const parts = {};
  for (let i = 0; i < n; i++) parts[SNAPSHOT_KEY + '_' + i] = text.slice(i * SNAPSHOT_CHUNK, (i + 1) * SNAPSHOT_CHUNK);
  parts[SNAPSHOT_KEY + '_n'] = String(n);
  try {
    const old = Number(props.getProperty(SNAPSHOT_KEY + '_n')) || 0;
    props.setProperties(parts);   // 다른 속성(FAMILY_KEY 등)은 그대로 둠
    for (let i = n; i < old; i++) props.deleteProperty(SNAPSHOT_KEY + '_' + i);
  } catch (e) {
    // 너무 커서 못 넣으면 스냅샷 없이 동작 (캐시·시트로)
    try { props.deleteProperty(SNAPSHOT_KEY + '_n'); } catch (_) {}
  }
}
function snapshotGet_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const n = Number(all[SNAPSHOT_KEY + '_n']);
  if (!n) return null;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const part = all[SNAPSHOT_KEY + '_' + i];
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

/** 쓰기 공통: 잠금 → 한 번 읽기 → change(store) → 한 번 쓰기 → 통계 시트 → 가벼운 응답 */
function mutate_(change) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const lookup = buildLookup_(ss);
    const store = loadStore_(ss);
    const extra = change(store) || {};
    saveStore_(store, lookup);
    const trips = tripsFromRows_(store.rows, lookup);
    const stats = rebuildStats_(ss, trips);
    cacheAppData_(lookup, trips, stats);
    return Object.assign({ data: { trips: trips, stats: stats } }, extra);
  });
}

function findIndexById_(store, id) {
  const i = store.rows.findIndex(r => String(r[COL.ID - 1]) === String(id));
  if (i < 0) throw new Error('해당 여행을 찾을 수 없어요. 새로고침 해 주세요.');
  return i;
}

/** 화면에서 미리 만든 ID를 쓰면 저장을 기다리지 않고도 화면과 시트가 같은 ID를 가짐 */
function safeId_(id) {
  return /^[A-Za-z0-9_-]{4,24}$/.test(String(id || '')) ? String(id) : newId_();
}

/**
 * trip: { people: [..], ids: { 사람: id }, dep: 'yyyy-mm-dd', ret, countries: [{ name, cities: [..] }], memo }
 * countries는 예전 형식(['일본', '태국'])도 받습니다.
 */
function addTrip_(trip) {
  const people = (trip.people || []).filter(p => FAMILY.some(f => f.name === p));
  if (!people.length) throw new Error('여행자를 선택해 주세요');
  if (!parseDate_(trip.dep)) throw new Error('출국일을 입력해 주세요');
  return mutate_(store => {
    const existing = new Set(store.rows.map(r => r[COL.PERSON - 1] + '|' + formatIso_(parseDate_(r[COL.DEP - 1]))));
    const texts = requestTexts_(trip.countries);
    const skipped = [];
    people.forEach(person => {
      if (existing.has(person + '|' + trip.dep)) { skipped.push(person); return; }
      store.rows.push(newRow_({
        ID: safeId_((trip.ids || {})[person]), PERSON: person, DEP: parseDate_(trip.dep), RET: parseDate_(trip.ret) || '',
        COUNTRIES: texts.countries, CITIES: texts.cities, MEMO: trip.memo || '',
      }));
    });
    return { skipped: skipped };
  });
}

/** 기존 여행 수정 (나라 채우기 등). trip: { person, dep, ret, countries, memo } */
function updateTrip_(id, trip) {
  if (!FAMILY.some(f => f.name === trip.person)) throw new Error('여행자를 선택해 주세요');
  if (!parseDate_(trip.dep)) throw new Error('출국일을 입력해 주세요');
  return mutate_(store => {
    const row = store.rows[findIndexById_(store, id)];
    const texts = requestTexts_(trip.countries);
    row[COL.PERSON - 1] = trip.person;
    row[COL.DEP - 1] = parseDate_(trip.dep);
    row[COL.RET - 1] = parseDate_(trip.ret) || '';
    row[COL.COUNTRIES - 1] = texts.countries;
    row[COL.CITIES - 1] = texts.cities;
    row[COL.MEMO - 1] = trip.memo || '';
  });
}

/**
 * 출입국증명서에서 읽은 날짜 한꺼번에 넣기. trips: [{ dep, ret }]
 * 증명서 파일 자체는 브라우저에서만 읽고, 여기로는 날짜만 옵니다.
 * 같은 사람·같은 출국일이 이미 있으면 건너뜁니다.
 */
function importTrips_(person, trips) {
  if (!FAMILY.some(f => f.name === person)) throw new Error('누구의 증명서인지 선택해 주세요');
  return mutate_(store => {
    const existing = new Set(store.rows.map(r => r[COL.PERSON - 1] + '|' + formatIso_(parseDate_(r[COL.DEP - 1]))));
    let added = 0, skipped = 0;
    trips.forEach(t => {
      const dep = parseDate_(t.dep);
      if (!dep) return;
      const key = person + '|' + formatIso_(dep);
      if (existing.has(key)) { skipped++; return; }
      existing.add(key);
      store.rows.push(newRow_({ ID: newId_(), PERSON: person, DEP: dep, RET: parseDate_(t.ret) || '', MEMO: '출입국증명서' }));
      added++;
    });
    return { added: added, skipped: skipped };
  });
}

function deleteTrip_(id) {
  return mutate_(store => { store.rows.splice(findIndexById_(store, id), 1); });
}

/* ───────────────────────── 공통 ───────────────────────── */

let spreadsheet_ = null;
function getSpreadsheet_() {
  if (spreadsheet_) return spreadsheet_;
  // 시트에 붙어 있는 스크립트면 getActiveSpreadsheet가 openById보다 빠름
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId() === SPREADSHEET_ID) return (spreadsheet_ = active);
  } catch (e) { /* 독립 스크립트 */ }
  return (spreadsheet_ = SpreadsheetApp.openById(SPREADSHEET_ID));
}

/* CacheService는 값 하나가 100KB까지라서 긴 글은 나눠서 저장 */
const CACHE_CHUNK = 30000;
function cachePut_(key, text) {
  const cache = CacheService.getScriptCache();
  const parts = {};
  const n = Math.ceil(text.length / CACHE_CHUNK) || 1;
  for (let i = 0; i < n; i++) parts[key + '_' + i] = text.slice(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK);
  parts[key + '_n'] = String(n);
  try { cache.putAll(parts, CACHE_SECONDS); } catch (e) { cacheRemove_(key); }
}
function cacheGet_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key + '_n'));
  if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => key + '_' + i);
  const got = cache.getAll(keys);
  if (keys.some(k => got[k] == null)) return null;
  return keys.map(k => got[k]).join('');
}
function cacheRemove_(key) {
  CacheService.getScriptCache().remove(key + '_n');
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/**
 * 국가목록 시트 + CITY_DATA → 이름으로 찾는 표
 *  countryByKey: 나라 이름·코드 / aliasByKey: 별칭 / cityByKey: 도시 → { name, country, code }
 * 국가목록 시트 내용은 CacheService에 6시간 캐시 (국가목록을 고치면 handleEdit이 캐시를 지움)
 */
let lookupCache_ = null;
function buildLookup_(ss) {
  if (lookupCache_) return lookupCache_;
  const countryByKey = {};
  const aliasByKey = {};
  const byCode = {};
  const list = [];
  const add = (name, code, aliases) => {
    name = String(name).trim();
    code = String(code).trim().toUpperCase();
    if (!name || countryByKey[normKey_(name)]) return;
    const entry = { name: name, code: /^[A-Z]{2}$/.test(code) ? code : '', aliases: aliases };
    list.push(entry);
    countryByKey[normKey_(name)] = entry;
    if (entry.code && !byCode[entry.code]) { byCode[entry.code] = entry; countryByKey[normKey_(entry.code)] = countryByKey[normKey_(entry.code)] || entry; }
    aliases.forEach(k => { if (k && !aliasByKey[normKey_(k)]) aliasByKey[normKey_(k)] = entry; });
  };
  readCountryRows_(ss).forEach(r => add(r[0], r[1], String(r[2]).split('|').map(s => s.trim()).filter(Boolean)));
  // 시트가 비었거나 지워진 경우 대비 기본 목록
  COUNTRY_DATA.forEach(line => {
    const [code, names] = line.split(':');
    const [name, ...aliases] = names.split('|');
    add(name, code, aliases);
  });
  const cityByKey = {};
  const cityData = cityData_();
  Object.keys(cityData).forEach(code => {
    const country = byCode[code];
    if (!country) return;
    cityData[code].forEach(city => {
      const k = normKey_(city);
      if (!cityByKey[k]) cityByKey[k] = { name: city, country: country.name, code: country.code };
    });
  });
  lookupCache_ = { countryByKey: countryByKey, aliasByKey: aliasByKey, cityByKey: cityByKey, list: list };
  return lookupCache_;
}

/** 국가목록 시트의 [국가, 코드, 별칭] 목록 (캐시 우선) */
function readCountryRows_(ss) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(COUNTRY_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const sheet = ss.getSheetByName(SHEET.COUNTRIES);
  const rows = sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().map(r => [String(r[0]), String(r[1]), String(r[4])])
    : [];
  try { cache.put(COUNTRY_CACHE_KEY, JSON.stringify(rows), 6 * 60 * 60); } catch (e) { /* 너무 크면 캐시 없이 */ }
  return rows;
}

/** Countries.gs의 도시 목록. 예전 Countries.gs라서 없으면 빈 목록으로 동작 (도시 자동완성만 빠짐) */
function cityData_() {
  return typeof CITY_DATA === 'undefined' ? {} : CITY_DATA;
}

/** 나라 이름 하나 찾기: 이름·코드 → 별칭 순서 */
function findCountry_(text, lookup) {
  const k = normKey_(text);
  return lookup.countryByKey[k] || lookup.aliasByKey[k] || null;
}

/**
 * '방문국가' + '방문도시' 칸 → [{ name, code, cities: [..] }]
 *  - 방문국가 칸에 도시 이름(다낭 등)을 쓰면 나라 + 도시로 나눔
 *  - 방문도시는 '오사카(일본)' 또는 '오사카' (목록에 있거나 나라가 하나뿐이면 괄호 생략 가능)
 *  - 한 여행 안에서 같은 나라/도시는 한 번만 셈
 */
function parseTrip_(countriesText, citiesText, lookup) {
  const countries = [];
  const unknown = [];
  const unknownCities = [];
  const getCountry = (name, code) => {
    let c = countries.find(x => x.name === name);
    if (!c) { c = { name: name, code: code, cities: [] }; countries.push(c); }
    return c;
  };
  const addCity = (c, city) => { if (c.cities.indexOf(city) < 0) c.cities.push(city); };
  const split = t => String(t || '').split(/[,，、/·\n]+/).map(x => x.replace(/^❓/, '').trim()).filter(Boolean);

  split(countriesText).forEach(raw => {
    const k = normKey_(raw);
    const exact = lookup.countryByKey[k];
    const city = !exact && lookup.cityByKey[k];
    const alias = !exact && !city && lookup.aliasByKey[k];
    if (exact || alias) getCountry((exact || alias).name, (exact || alias).code);
    else if (city) addCity(getCountry(city.country, city.code), city.name);
    else { getCountry(raw, ''); unknown.push(raw); }
  });

  const pending = [];
  split(citiesText).forEach(raw => {
    const m = raw.match(/^(.+?)\s*[(（](.+)[)）]$/);
    const cityName = (m ? m[1] : raw).trim();
    const known = lookup.cityByKey[normKey_(cityName)];
    if (m) {
      const country = findCountry_(m[2], lookup);
      if (!country) unknown.push(m[2].trim());
      addCity(getCountry(country ? country.name : m[2].trim(), country ? country.code : ''), known && country && known.code === country.code ? known.name : cityName);
    } else if (known) {
      addCity(getCountry(known.country, known.code), known.name);
    } else {
      pending.push(cityName);
    }
  });
  // 목록에 없는 도시: 나라가 하나뿐이면 그 나라 도시로 봄
  pending.forEach(city => {
    if (countries.length === 1) addCity(countries[0], city); else unknownCities.push(city);
  });
  return { countries: countries, unknown: unknown, unknownCities: unknownCities };
}

/** [{ name, cities }] → 시트에 쓰는 글자 { countries: '일본, 태국', cities: '오사카(일본), 방콕(태국)' } */
function tripTexts_(countries) {
  return {
    countries: countries.map(c => c.name).join(', '),
    cities: [].concat(...countries.map(c => c.cities.map(city => city + '(' + c.name + ')'))).join(', '),
  };
}

/** API 요청의 countries (문자열 배열 또는 { name, cities } 배열) → 시트 글자 */
function requestTexts_(countries) {
  return tripTexts_((countries || []).map(c => typeof c === 'string'
    ? { name: c, cities: [] }
    : { name: String(c.name || ''), cities: (c.cities || []).map(String).filter(Boolean) }).filter(c => c.name));
}

function countCities_(countries) {
  return countries.reduce((s, c) => s + c.cities.length, 0);
}

function normKey_(s) {
  return String(s).toLowerCase().replace(/\s+/g, '');
}

/** 'JP' → 🇯🇵 */
function flagEmoji_(code) {
  return String(code).toUpperCase().split('')
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

function flagImageFormula_(code) {
  return '=IMAGE("https://flagcdn.com/w80/' + String(code).toLowerCase() + '.png")';
}

function parseDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function formatIso_(d) {
  return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}

function daysBetween_(a, b) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

function durationLabel_(dep, ret) {
  if (!dep || !ret) return '';
  const nights = daysBetween_(dep, ret);
  return nights === 0 ? '당일' : nights + '박' + (nights + 1) + '일';
}

function newId_() {
  return Utilities.getUuid().slice(0, 8);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
