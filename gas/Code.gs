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

/* ───────────────────────── 설치 ───────────────────────── */

/** 처음 한 번 실행: 시트 만들기 + 국가목록 채우기 + 자동 국기 트리거 */
function setup() {
  const ss = getSpreadsheet_();
  setupTripSheet_(ss);
  setupCountrySheet_(ss);
  getOrCreateSheet_(ss, SHEET.STATS);
  getOrCreateSheet_(ss, SHEET.BY_COUNTRY);
  installEditTrigger_(ss);
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

/** 예전 시트(방문도시·도시 수 열이 없던 버전)를 새 열 구성으로 맞춤. 여러 번 불러도 안전 */
let tripColumnsChecked_ = false;
function ensureTripColumns_(ss) {
  if (tripColumnsChecked_) return;
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  if (!sheet || sheet.getLastColumn() === 0) return;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (header[0] !== 'ID') { tripColumnsChecked_ = true; return; }  // 처음 만드는 시트
  let changed = false;
  TRIP_HEADERS.forEach((h, i) => {
    if (header[i] === h || ADDED_COLUMNS.indexOf(h) < 0) return;
    sheet.insertColumnBefore(i + 1);
    header.splice(i, 0, h);
    changed = true;
  });
  if (changed) sheet.getRange(1, 1, 1, TRIP_HEADERS.length).setValues([TRIP_HEADERS]);
  tripColumnsChecked_ = true;
}

/** 메뉴: 메모에 적어 둔 도시 이름을 '방문도시' 칸으로 옮김 (목록에 있는 도시만, 나머지 메모는 그대로) */
function moveMemoCities() {
  const ss = getSpreadsheet_();
  ensureTripColumns_(ss);
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  const lookup = buildLookup_(ss);
  let moved = 0;
  for (let r = 2; r <= sheet.getLastRow(); r++) {
    const memoCell = sheet.getRange(r, COL.MEMO);
    const { found, rest } = splitMemoCities_(String(memoCell.getValue()), lookup);
    if (!found.length) continue;
    const citiesCell = sheet.getRange(r, COL.CITIES);
    citiesCell.setValue([String(citiesCell.getValue()).trim()].concat(found).filter(Boolean).join(', '));
    memoCell.setValue(rest);
    refreshTripRow_(sheet, r, lookup);
    moved += found.length;
  }
  rebuildStats_(ss);
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

function installEditTrigger_(ss) {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'handleEdit');
  if (!exists) ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
}

/* ───────────────────────── 시트에서 직접 편집할 때 ───────────────────────── */

/** 설치형 onEdit 트리거: 여행기록/국가목록이 바뀌면 국기·기간·통계를 다시 계산 */
function handleEdit(e) {
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  ensureTripColumns_(sheet.getParent());
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
  ensureTripColumns_(ss);
  const sheet = ss.getSheetByName(SHEET.TRIPS);
  const lookup = buildLookup_(ss);
  for (let r = 2; r <= sheet.getLastRow(); r++) refreshTripRow_(sheet, r, lookup);
  rebuildStats_(ss);
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
  const rawCities = String(v[COL.CITIES - 1]).trim();

  if (!person && !dep && !rawCountries && !rawCities) return; // 빈 줄

  if (!v[COL.ID - 1]) v[COL.ID - 1] = newId_();
  if (dep) v[COL.DEP - 1] = dep;
  if (ret) v[COL.RET - 1] = ret;
  v[COL.DAYS - 1] = durationLabel_(dep, ret);

  const parsed = parseTrip_(rawCountries, rawCities, lookup);
  const texts = tripTexts_(parsed.countries);
  v[COL.COUNTRIES - 1] = texts.countries;
  v[COL.CITIES - 1] = [texts.cities].concat(parsed.unknownCities).filter(Boolean).join(', ');
  v[COL.FLAGS - 1] = parsed.countries.map(c => c.code ? flagEmoji_(c.code) : '❓').join(' ');
  v[COL.COUNT - 1] = parsed.countries.length || '';
  v[COL.CITY_COUNT - 1] = countCities_(parsed.countries) || '';
  range.setValues([v]);

  const countryCell = sheet.getRange(row, COL.COUNTRIES);
  if (parsed.unknown.length) {
    countryCell.setBackground(UNKNOWN_COLOR)
      .setNote('국가목록에 없는 이름: ' + parsed.unknown.join(', ') + '\n국가목록 탭에 추가하거나 별칭을 등록하세요.');
  } else if (!parsed.countries.length) {
    countryCell.setBackground(MISSING_COLOR).setNote('나라를 입력해 주세요');
  } else {
    countryCell.setBackground(null).clearNote();
  }
  const cityCell = sheet.getRange(row, COL.CITIES);
  if (parsed.unknownCities.length) {
    cityCell.setBackground(UNKNOWN_COLOR)
      .setNote('어느 나라 도시인지 모르겠어요: ' + parsed.unknownCities.join(', ') + '\n오사카(일본)처럼 괄호 안에 나라를 적어 주세요.');
  } else {
    cityCell.setBackground(null).clearNote();
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
  sheet.clear();
  const header = ['여행자', '출국 횟수', '나라 방문 횟수', '가본 나라 수', '도시 방문 횟수', '가본 도시 수',
    '총 여행일수', '최근 출국', '나라 미입력', '가본 나라 · 도시'];
  const rows = stats.people.map(p => [
    p.name + ' (' + p.role + ')',
    p.departures,
    p.countryVisits,
    p.uniqueCountries,
    p.cityVisits,
    p.uniqueCities,
    p.days,
    p.lastDep ? p.lastDep.replace(/-/g, '.') : '',
    p.missing ? p.missing + '건' : '',
    Object.keys(p.visitCount)
      .sort((a, b) => p.visitCount[b] - p.visitCount[a])
      .map(n => {
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
  ]);
  sheet.getRange(1, 1).setValue('👨‍👩‍👧 가족 여행 통계').setFontSize(14).setFontWeight('bold');
  sheet.getRange(2, 1).setValue('출국 횟수 = 한국에서 나간 횟수 · 나라/도시 방문 횟수 = 한 번 나가서 여러 곳을 가면 곳마다 1회씩 · 가본 나라/도시 수 = 중복 제외')
    .setFontColor('#666666');
  sheet.getRange(4, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.getRange(5, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(5, 2, rows.length, 5).setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');

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
  sheet.setColumnWidths(2, 8, 95);
  sheet.setColumnWidth(10, 700);
}

function writeByCountrySheet_(ss, stats) {
  const sheet = getOrCreateSheet_(ss, SHEET.BY_COUNTRY);
  sheet.clear();
  const header = ['국기', '', '나라'].concat(FAMILY.map(f => f.name), ['합계', '다녀온 도시']);
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  if (!stats.countries.length) return;
  const rows = stats.countries.map(c => [
    c.code ? flagImageFormula_(c.code) : '',
    c.code ? flagEmoji_(c.code) : '',
    c.name,
  ].concat(FAMILY.map(f => c.byPerson[f.name] || ''), [c.total, cityListText_(c.cities)]));
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(2, 2, rows.length).setFontSize(16);
  sheet.getRange(2, 4, rows.length, FAMILY.length + 1).setHorizontalAlignment('center');
  sheet.setRowHeights(2, rows.length, 28);
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(2, 40);
  sheet.setColumnWidth(header.length, 400);
}

/* ───────────────────────── API (GitHub의 index.html이 호출) ───────────────────────── */

/**
 * 화면(HTML)은 GitHub Pages에 있고, 이 스크립트는 시트 저장/조회만 하는 API입니다.
 * 모든 요청은 POST, 본문은 JSON 문자열: { action, key, ... }
 *   action: 'get' | 'add' | 'update' | 'delete' | 'import'
 * key: 가족 비밀번호 (스크립트 속성 FAMILY_KEY). 웹앱을 '모든 사용자'로 공개하므로 이걸로 막습니다.
 */
function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkKey_(req.key);
    ensureTripColumns_(getSpreadsheet_());
    switch (req.action) {
      case 'get': return json_({ ok: true, data: getAppData_() });
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
    cities: cityData_(),
    trips: trips,
    stats: computeStats_(trips),
  };
}

/**
 * trip: { people: [..], dep: 'yyyy-mm-dd', ret: 'yyyy-mm-dd', countries: [{ name, cities: [..] }], memo }
 * countries는 예전 형식(['일본', '태국'])도 받습니다.
 */
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
      const texts = requestTexts_(trip.countries);
      const values = new Array(TRIP_HEADERS.length).fill('');
      values[COL.ID - 1] = newId_();
      values[COL.PERSON - 1] = person;
      values[COL.DEP - 1] = parseDate_(trip.dep);
      values[COL.RET - 1] = parseDate_(trip.ret) || '';
      values[COL.COUNTRIES - 1] = texts.countries;
      values[COL.CITIES - 1] = texts.cities;
      values[COL.MEMO - 1] = trip.memo || '';
      sheet.getRange(row, 1, 1, TRIP_HEADERS.length).setValues([values]);
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
    const texts = requestTexts_(trip.countries);
    sheet.getRange(row, COL.COUNTRIES, 1, 2).setValues([[texts.countries, texts.cities]]);
    sheet.getRange(row, COL.MEMO).setValue(trip.memo || '');
    refreshTripRow_(sheet, row, buildLookup_(ss));
    sortTrips_(sheet);
    rebuildStats_(ss);
    return { data: getAppData_() };
  });
}

/**
 * 출입국증명서에서 읽은 날짜 한꺼번에 넣기. trips: [{ dep, ret }]
 * 증명서 파일 자체는 브라우저에서만 읽고, 여기로는 날짜만 옵니다.
 * 같은 사람·같은 출국일이 이미 있으면 건너뜁니다.
 */
function importTrips_(person, trips) {
  return withLock_(() => {
    if (!FAMILY.some(f => f.name === person)) throw new Error('누구의 증명서인지 선택해 주세요');
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET.TRIPS);
    const existing = new Set(readTrips_(ss).map(t => t.person + '|' + t.dep));
    const rows = [];
    let skipped = 0;
    trips.forEach(t => {
      const dep = parseDate_(t.dep);
      if (!dep) return;
      const key = person + '|' + formatIso_(dep);
      if (existing.has(key)) { skipped++; return; }
      existing.add(key);
      const values = new Array(TRIP_HEADERS.length).fill('');
      values[COL.ID - 1] = newId_();
      values[COL.PERSON - 1] = person;
      values[COL.DEP - 1] = dep;
      values[COL.RET - 1] = parseDate_(t.ret) || '';
      values[COL.MEMO - 1] = '출입국증명서';
      rows.push(values);
    });
    if (rows.length) {
      const start = sheet.getLastRow() + 1;
      sheet.getRange(start, 1, rows.length, TRIP_HEADERS.length).setValues(rows);
      const lookup = buildLookup_(ss);
      for (let r = start; r < start + rows.length; r++) refreshTripRow_(sheet, r, lookup);
      sortTrips_(sheet);
    }
    rebuildStats_(ss);
    return { data: getAppData_(), added: rows.length, skipped: skipped };
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
        countries: parseTrip_(String(v[COL.COUNTRIES - 1]), String(v[COL.CITIES - 1]), lookup).countries,
        memo: String(v[COL.MEMO - 1]),
      };
    })
    .filter(t => t.person)
    .sort((a, b) => (a.dep < b.dep ? 1 : a.dep > b.dep ? -1 : 0));
}

/**
 * 국가목록 시트 + CITY_DATA → 이름으로 찾는 표
 *  countryByKey: 나라 이름·코드 / aliasByKey: 별칭 / cityByKey: 도시 → { name, country, code }
 */
function buildLookup_(ss) {
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
  return { countryByKey: countryByKey, aliasByKey: aliasByKey, cityByKey: cityByKey, list: list };
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
