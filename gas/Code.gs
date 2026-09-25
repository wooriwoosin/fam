/**
 * 우리 가족 해외여행 기록장
 *
 * 시트 구성
 *  - 여행기록 : 한 번 출국할 때마다 한 줄 (가족이 같이 가면 사람마다 한 줄씩)
 *  - 통계     : 사람별 출국 횟수 / 나라 방문 횟수 / 가본 나라 수, 연도별 출국 횟수
 *  - 나라별   : 나라마다 누가 몇 번 갔는지 (국기 이미지 포함)
 *  - 국가목록 : 나라 이름 ↔ 국기 매칭표 (없는 나라는 여기에 한 줄 추가)
 *
 * 화면(index.html)은 GitHub Pages에 두고, 이 스크립트는 시트 저장/조회 API 역할만 합니다.
 * 처음 한 번만 편집기에서 setFamilyKey → setup 순서로 실행하세요.
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

const TRIP_HEADERS = ['ID', '여행자', '출국일', '입국일', '기간', '방문국가', '국기', '나라 수', '메모'];
const COL = { ID: 1, PERSON: 2, DEP: 3, RET: 4, DAYS: 5, COUNTRIES: 6, FLAGS: 7, COUNT: 8, MEMO: 9 };

const COUNTRY_HEADERS = ['국가', '코드', '국기', '국기 이미지', '별칭 (| 로 구분)'];

// 출입국사실증명서(2000.01.01 ~ 2026.09.24)에 나온 김민정 출국 기록. 나라는 증명서에 없어서 직접 입력해야 합니다.
const SEED_TRIPS = {
  '김민정': [
    ['2005-01-08', '2005-01-13'], ['2016-11-02', '2016-11-08'], ['2017-06-04', '2017-06-06'],
    ['2017-09-09', '2017-09-11'], ['2019-03-09', '2019-03-14'], ['2019-09-04', '2019-09-08'],
    ['2023-09-22', '2023-10-05'], ['2024-04-10', '2024-04-15'], ['2024-06-05', '2024-06-12'],
    ['2025-01-18', '2025-01-20'], ['2025-03-21', '2025-03-26'], ['2025-04-30', '2025-05-04'],
    ['2025-05-31', '2025-06-04'], ['2025-06-13', '2025-06-15'], ['2025-09-27', '2025-10-15'],
    ['2026-02-11', '2026-02-18'], ['2026-03-02', '2026-03-04'], ['2026-04-04', '2026-04-07'],
    ['2026-04-30', '2026-05-12'], ['2026-06-02', '2026-06-06'], ['2026-09-17', '2026-09-19'],
  ],
};

const DATE_FORMAT = 'yyyy.mm.dd';
const MISSING_COLOR = '#fff4c2';
const UNKNOWN_COLOR = '#ffd6d6';

/* ───────────────────────── 설치 ───────────────────────── */

/** 처음 한 번 실행: 시트 만들기 + 국가목록 채우기 + 자동 국기 트리거 + 민정 출입국 기록 불러오기 */
function setup() {
  const ss = getSpreadsheet_();
  setupTripSheet_(ss);
  setupCountrySheet_(ss);
  getOrCreateSheet_(ss, SHEET.STATS);
  getOrCreateSheet_(ss, SHEET.BY_COUNTRY);
  installEditTrigger_(ss);
  seedTrips();
  refreshAll();
}

/** 출입국증명서 기록을 여행기록에 넣기 (이미 있는 출국일은 건너뜀) */
function seedTrips() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  const existing = new Set(readTrips_(ss).map(t => t.person + '|' + t.dep));
  const rows = [];
  Object.keys(SEED_TRIPS).forEach(person => {
    SEED_TRIPS[person].forEach(([dep, ret]) => {
      if (existing.has(person + '|' + dep)) return;
      rows.push([newId_(), person, parseDate_(dep), parseDate_(ret), '', '', '', '', '출입국증명서']);
    });
  });
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TRIP_HEADERS.length).setValues(rows);
  sortTrips_(sheet);
}

function setupTripSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET.TRIPS);
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
  sheet.setColumnWidth(COL.COUNTRIES, 220);
  sheet.setColumnWidth(COL.FLAGS, 140);
  sheet.setColumnWidth(COL.COUNT, 60);
  sheet.setColumnWidth(COL.MEMO, 200);
  sheet.getRange(1, COL.COUNTRIES).setNote('나라 이름을 쉼표로 구분해서 입력하세요. 예) 일본, 태국\n도시 이름(다낭, 발리 등)도 알아서 나라로 바꿔줍니다.');
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

function installEditTrigger_(ss) {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'handleEdit');
  if (!exists) ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
}

/* ───────────────────────── 시트에서 직접 편집할 때 ───────────────────────── */

/** 설치형 onEdit 트리거: 여행기록/국가목록이 바뀌면 국기·기간·통계를 다시 계산 */
function handleEdit(e) {
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (name === SHEET.COUNTRIES) {
    fillCountryFlags_(sheet);
    refreshAll();
  } else if (name === SHEET.TRIPS && e.range.getLastRow() > 1) {
    const lookup = buildLookup_(sheet.getParent());
    const first = Math.max(2, e.range.getRow());
    for (let r = first; r <= e.range.getLastRow(); r++) refreshTripRow_(sheet, r, lookup);
    rebuildStats_(sheet.getParent());
  }
}

/** 메뉴/수동 실행용: 모든 행의 국기·기간과 통계를 새로 계산 */
function refreshAll() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  const lookup = buildLookup_(ss);
  for (let r = 2; r <= sheet.getLastRow(); r++) refreshTripRow_(sheet, r, lookup);
  rebuildStats_(ss);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('✈️ 여행기록')
    .addItem('국기·통계 새로고침', 'refreshAll')
    .addItem('처음 설정 (setup)', 'setup')
    .addToUi();
}

function fillCountryFlags_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const range = sheet.getRange(2, 1, last - 1, 4);
  const values = range.getValues();
  values.forEach((row, i) => {
    const code = String(row[1]).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (!row[2]) sheet.getRange(i + 2, 3).setValue(flagEmoji_(code));
    if (!row[3]) sheet.getRange(i + 2, 4).setFormula(flagImageFormula_(code));
  });
}

function refreshTripRow_(sheet, row, lookup) {
  const range = sheet.getRange(row, 1, 1, TRIP_HEADERS.length);
  const v = range.getValues()[0];
  const person = String(v[COL.PERSON - 1]).trim();
  const dep = parseDate_(v[COL.DEP - 1]);
  const ret = parseDate_(v[COL.RET - 1]);
  const rawCountries = String(v[COL.COUNTRIES - 1]).trim();

  if (!person && !dep && !rawCountries) return; // 빈 줄

  if (!v[COL.ID - 1]) v[COL.ID - 1] = newId_();
  if (dep) v[COL.DEP - 1] = dep;
  if (ret) v[COL.RET - 1] = ret;
  v[COL.DAYS - 1] = durationLabel_(dep, ret);

  const parsed = parseCountries_(rawCountries, lookup);
  v[COL.COUNTRIES - 1] = parsed.items.map(c => c.name).join(', ');
  v[COL.FLAGS - 1] = parsed.items.map(c => c.code ? flagEmoji_(c.code) : '❓').join(' ');
  v[COL.COUNT - 1] = parsed.items.length || '';
  range.setValues([v]);

  const countryCell = sheet.getRange(row, COL.COUNTRIES);
  if (parsed.unknown.length) {
    countryCell.setBackground(UNKNOWN_COLOR)
      .setNote('국가목록에 없는 이름: ' + parsed.unknown.join(', ') + '\n국가목록 탭에 추가하거나 별칭을 등록하세요.');
  } else if (!parsed.items.length) {
    countryCell.setBackground(MISSING_COLOR).setNote('나라를 입력해 주세요');
  } else {
    countryCell.setBackground(null).clearNote();
  }
}

/* ───────────────────────── 통계 ───────────────────────── */

function rebuildStats_(ss) {
  const trips = readTrips_(ss);
  const stats = computeStats_(trips);
  writeStatsSheet_(ss, stats);
  writeByCountrySheet_(ss, stats);
}

function computeStats_(trips) {
  const people = FAMILY.map(f => {
    const mine = trips.filter(t => t.person === f.name);
    const visitCount = {};
    mine.forEach(t => t.countries.forEach(c => { visitCount[c.name] = (visitCount[c.name] || 0) + 1; }));
    const lastDep = mine.reduce((m, t) => (t.dep > m ? t.dep : m), '');
    return {
      name: f.name,
      role: f.role,
      departures: mine.length,
      countryVisits: mine.reduce((s, t) => s + t.countries.length, 0),
      uniqueCountries: Object.keys(visitCount).length,
      days: mine.reduce((s, t) => s + (t.days || 0), 0),
      missing: mine.filter(t => !t.countries.length).length,
      lastDep: lastDep,
      visitCount: visitCount,
    };
  });

  const countryMap = {};
  trips.forEach(t => t.countries.forEach(c => {
    const e = countryMap[c.name] || (countryMap[c.name] = { name: c.name, code: c.code, total: 0, byPerson: {} });
    e.total++;
    e.byPerson[t.person] = (e.byPerson[t.person] || 0) + 1;
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

function writeStatsSheet_(ss, stats) {
  const sheet = getOrCreateSheet_(ss, SHEET.STATS);
  sheet.clear();
  const header = ['여행자', '출국 횟수', '나라 방문 횟수', '가본 나라 수', '총 여행일수', '최근 출국', '나라 미입력', '가본 나라'];
  const rows = stats.people.map(p => [
    p.name + ' (' + p.role + ')',
    p.departures,
    p.countryVisits,
    p.uniqueCountries,
    p.days,
    p.lastDep ? p.lastDep.replace(/-/g, '.') : '',
    p.missing ? p.missing + '건' : '',
    Object.keys(p.visitCount)
      .sort((a, b) => p.visitCount[b] - p.visitCount[a])
      .map(n => {
        const c = stats.countries.find(x => x.name === n);
        return (c && c.code ? flagEmoji_(c.code) : '') + n + (p.visitCount[n] > 1 ? '×' + p.visitCount[n] : '');
      }).join('  '),
  ]);
  sheet.getRange(1, 1).setValue('👨‍👩‍👧 가족 여행 통계').setFontSize(14).setFontWeight('bold');
  sheet.getRange(2, 1).setValue('출국 횟수 = 한국에서 나간 횟수 · 나라 방문 횟수 = 한 번 나가서 여러 나라를 가면 나라마다 1회씩 · 가본 나라 수 = 중복 제외')
    .setFontColor('#666666');
  sheet.getRange(4, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.getRange(5, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(5, 2, rows.length, 3).setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');

  // 연도별 출국 횟수
  const yearStart = 6 + rows.length;
  sheet.getRange(yearStart, 1).setValue('📅 연도별 출국 횟수').setFontWeight('bold');
  const yearHeader = ['연도'].concat(FAMILY.map(f => f.name));
  const yearRows = Object.keys(stats.years).sort().reverse()
    .map(y => [y].concat(FAMILY.map(f => stats.years[y][f.name] || '')));
  sheet.getRange(yearStart + 1, 1, 1, yearHeader.length).setValues([yearHeader]).setFontWeight('bold').setBackground('#dbe9f6');
  if (yearRows.length) {
    sheet.getRange(yearStart + 2, 1, yearRows.length, yearHeader.length).setValues(yearRows).setHorizontalAlignment('center');
  }
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidths(2, 6, 95);
  sheet.setColumnWidth(8, 600);
}

function writeByCountrySheet_(ss, stats) {
  const sheet = getOrCreateSheet_(ss, SHEET.BY_COUNTRY);
  sheet.clear();
  const header = ['국기', '', '나라'].concat(FAMILY.map(f => f.name), ['합계']);
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  if (!stats.countries.length) return;
  const rows = stats.countries.map(c => [
    c.code ? flagImageFormula_(c.code) : '',
    c.code ? flagEmoji_(c.code) : '',
    c.name,
  ].concat(FAMILY.map(f => c.byPerson[f.name] || ''), [c.total]));
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(2, 2, rows.length).setFontSize(16);
  sheet.getRange(2, 4, rows.length, FAMILY.length + 1).setHorizontalAlignment('center');
  sheet.setRowHeights(2, rows.length, 28);
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(2, 40);
}

/* ───────────────────────── API (GitHub의 index.html이 호출) ───────────────────────── */

/**
 * 화면(HTML)은 GitHub Pages에 있고, 이 스크립트는 시트 저장/조회만 하는 API입니다.
 * 모든 요청은 POST, 본문은 JSON 문자열: { action, key, ... }
 *   action: 'get' | 'add' | 'update' | 'delete'
 * key: 가족 비밀번호 (스크립트 속성 FAMILY_KEY). 웹앱을 '모든 사용자'로 공개하므로 이걸로 막습니다.
 */
function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkKey_(req.key);
    switch (req.action) {
      case 'get': return json_({ ok: true, data: getAppData_() });
      case 'add': return json_(Object.assign({ ok: true }, addTrip_(req.trip || {})));
      case 'update': return json_(Object.assign({ ok: true }, updateTrip_(req.id, req.trip || {})));
      case 'delete': return json_(Object.assign({ ok: true }, deleteTrip_(req.id)));
      default: throw new Error('알 수 없는 요청: ' + req.action);
    }
  } catch (err) {
    return json_({ ok: false, error: err.message, auth: err.name === 'AuthError' });
  }
}

/** 주소를 브라우저로 열었을 때 동작 확인용 */
function doGet() {
  return json_({ ok: true, message: '가족 여행기록 API가 동작 중입니다. 화면은 GitHub Pages 주소로 여세요.' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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

function getAppData_() {
  const ss = getSpreadsheet_();
  const trips = readTrips_(ss);
  const lookup = buildLookup_(ss);
  return {
    family: FAMILY,
    countries: lookup.list,
    trips: trips,
    stats: computeStats_(trips),
  };
}

/** trip: { people: [..], dep: 'yyyy-mm-dd', ret: 'yyyy-mm-dd', countries: [..], memo } */
function addTrip_(trip) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET.TRIPS);
    const people = (trip.people || []).filter(p => FAMILY.some(f => f.name === p));
    if (!people.length) throw new Error('여행자를 선택해 주세요');
    if (!parseDate_(trip.dep)) throw new Error('출국일을 입력해 주세요');
    const existing = new Set(readTrips_(ss).map(t => t.person + '|' + t.dep));
    const skipped = [];
    const lookup = buildLookup_(ss);
    people.forEach(person => {
      if (existing.has(person + '|' + trip.dep)) { skipped.push(person); return; }
      const row = sheet.getLastRow() + 1;
      sheet.getRange(row, 1, 1, TRIP_HEADERS.length).setValues([[
        newId_(), person, parseDate_(trip.dep), parseDate_(trip.ret) || '',
        '', (trip.countries || []).join(', '), '', '', trip.memo || '',
      ]]);
      refreshTripRow_(sheet, row, lookup);
    });
    sortTrips_(sheet);
    rebuildStats_(ss);
    return { data: getAppData_(), skipped: skipped };
  });
}

/** 기존 여행 수정 (나라 채우기 등). trip: { person, dep, ret, countries, memo } */
function updateTrip_(id, trip) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET.TRIPS);
    if (!FAMILY.some(f => f.name === trip.person)) throw new Error('여행자를 선택해 주세요');
    if (!parseDate_(trip.dep)) throw new Error('출국일을 입력해 주세요');
    const row = findRowById_(sheet, id);
    sheet.getRange(row, COL.PERSON, 1, 2).setValues([[trip.person, parseDate_(trip.dep)]]);
    sheet.getRange(row, COL.RET).setValue(parseDate_(trip.ret) || '');
    sheet.getRange(row, COL.COUNTRIES).setValue((trip.countries || []).join(', '));
    sheet.getRange(row, COL.MEMO).setValue(trip.memo || '');
    refreshTripRow_(sheet, row, buildLookup_(ss));
    sortTrips_(sheet);
    rebuildStats_(ss);
    return { data: getAppData_() };
  });
}

function deleteTrip_(id) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET.TRIPS);
    sheet.deleteRow(findRowById_(sheet, id));
    rebuildStats_(ss);
    return { data: getAppData_() };
  });
}

/* ───────────────────────── 공통 ───────────────────────── */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readTrips_(ss) {
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lookup = buildLookup_(ss);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, TRIP_HEADERS.length).getValues()
    .map(v => {
      const dep = parseDate_(v[COL.DEP - 1]);
      const ret = parseDate_(v[COL.RET - 1]);
      return {
        id: String(v[COL.ID - 1]),
        person: String(v[COL.PERSON - 1]).trim(),
        dep: formatIso_(dep),
        ret: formatIso_(ret),
        days: dep && ret ? daysBetween_(dep, ret) + 1 : 0,
        countries: parseCountries_(String(v[COL.COUNTRIES - 1]), lookup).items,
        memo: String(v[COL.MEMO - 1]),
      };
    })
    .filter(t => t.person)
    .sort((a, b) => (a.dep < b.dep ? 1 : a.dep > b.dep ? -1 : 0));
}

/** 국가목록 시트 → 이름/별칭/코드로 찾을 수 있는 표 */
function buildLookup_(ss) {
  const byKey = {};
  const list = [];
  const add = (name, code, aliases) => {
    name = String(name).trim();
    code = String(code).trim().toUpperCase();
    if (!name || byKey[normKey_(name)]) return;
    const entry = { name: name, code: /^[A-Z]{2}$/.test(code) ? code : '', aliases: aliases };
    list.push(entry);
    [name].concat(aliases).forEach(k => { if (k && !byKey[normKey_(k)]) byKey[normKey_(k)] = entry; });
    if (entry.code && !byKey[normKey_(entry.code)]) byKey[normKey_(entry.code)] = entry;
  };
  const sheet = ss.getSheetByName(SHEET.COUNTRIES);
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(r => {
      add(r[0], r[1], String(r[4]).split('|').map(s => s.trim()).filter(Boolean));
    });
  }
  // 시트가 비었거나 지워진 경우 대비 기본 목록
  COUNTRY_DATA.forEach(line => {
    const [code, names] = line.split(':');
    const [name, ...aliases] = names.split('|');
    add(name, code, aliases);
  });
  return { byKey: byKey, list: list };
}

function parseCountries_(text, lookup) {
  const items = [];
  const unknown = [];
  String(text || '').split(/[,，、/·\n]+/).map(s => s.replace(/^❓/, '').trim()).filter(Boolean).forEach(raw => {
    const hit = lookup.byKey[normKey_(raw)];
    if (hit) items.push({ name: hit.name, code: hit.code });
    else { items.push({ name: raw, code: '' }); unknown.push(raw); }
  });
  return { items: items, unknown: unknown };
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
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
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

function findRowById_(sheet, id) {
  const ids = sheet.getRange(2, COL.ID, Math.max(sheet.getLastRow() - 1, 1)).getValues();
  const i = ids.findIndex(r => String(r[0]) === String(id));
  if (i < 0) throw new Error('해당 여행을 찾을 수 없어요. 새로고침 해 주세요.');
  return i + 2;
}

/** 출국일 최신순 정렬 */
function sortTrips_(sheet) {
  if (sheet.getLastRow() < 3) return;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, TRIP_HEADERS.length)
    .sort([{ column: COL.DEP, ascending: false }, { column: COL.PERSON, ascending: true }]);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
