/**
 * 🗑 휴지통 · 📦 전체 백업
 *
 * - 지우면 바로 없애지 않고, 지운 줄들을 통째로(DB 줄 그대로) 휴지통(trash)에 넣은 뒤 지움. 자동으로 비우지 않음
 * - 되살리기: 휴지통에 넣어 둔 줄을 연결 순서대로 다시 넣음 (같은 ID라 몇 번 다시 보내도 결과가 같음)
 * - 전체 백업 파일(JSON): 모든 표를 파일 하나로. 되살리기는 빠진 줄만 채움
 * index.html·journey.js의 전역(DATA, enqueue, tripToRow, journeyToRow …)을 그대로 씀
 */

// 되살릴 때 넣는 순서 (가리키는 쪽보다 가리켜지는 쪽 먼저)
const TABLE_ORDER = ['journeys', 'trips', 'flights', 'stays', 'expenses', 'places', 'settle_checks', 'pack_items', 'pack_checks'];
// DB 표 이름 → DATA 안의 목록 이름 · 줄 → 화면 변환
const TABLE_DATA = {
  journeys: ['journeys', r => rowToJourney(r)], trips: ['trips', r => rowToTrip(r)], expenses: ['expenses', r => rowToExpense(r)],
  places: ['places', r => rowToPlace(r)], settle_checks: ['checks', r => rowToCheck(r)],
  pack_items: ['packItems', r => rowToPackItem(r)], pack_checks: ['packChecks', r => rowToPackCheck(r)],
  flights: ['flights', r => rowToFlight(r)], stays: ['stays', r => rowToStay(r)],
};
const KIND_NAME = { journey: '🧳 여행', trip: '🙋 일행 기록', expense: '💰 지출', place: '📍 일정', flight: '✈️ 항공편', stay: '🏨 숙소' };

function rowToTrash(r) {
  return { id: String(r.id), kind: r.kind || '', label: r.label || '', journeyId: r.journey_id || '',
    data: r.data && typeof r.data === 'object' ? r.data : {}, deletedAt: r.deleted_at || '' };
}
const trashToRow = x => ({ id: x.id, kind: x.kind, label: x.label, journey_id: x.journeyId || null, data: x.data, deleted_at: x.deletedAt });

/** 여행 하나에 딸린 모든 줄 (DB 줄 모양) */
function journeyBundle(jid) {
  const of = list => (list || []).filter(x => x.journeyId === jid);
  return {
    journeys: [journeyToRow(getJourney(jid))], trips: membersOf(jid).map(tripToRow),
    expenses: of(DATA.expenses).map(expenseToRow), places: of(DATA.places).map(placeToRow), settle_checks: of(DATA.checks).map(checkToRow),
    pack_items: of(DATA.packItems).map(packItemToRow), pack_checks: of(DATA.packChecks).map(packCheckToRow),
    flights: of(DATA.flights).map(flightToRow), stays: of(DATA.stays).map(stayToRow),
  };
}

/** 화면에서 먼저 빼고, 휴지통 저장 → 지우기를 한 작업으로 보냄 (휴지통 저장이 실패하면 안 지워짐) */
function sendToTrash(kind, label, journeyId, data, deletes) {
  Object.keys(TABLE_DATA).forEach(t => {
    const ids = new Set((data[t] || []).map(r => String(r.id)));
    const key = TABLE_DATA[t][0];
    if (ids.size) DATA[key] = (DATA[key] || []).filter(x => !ids.has(x.id));
  });
  if (DATA.noStep4) return enqueue('trash', { deletes });   // 휴지통 표가 아직 없으면 예전처럼 바로 지움
  const item = { id: 'tr_' + newId(), kind, label, journeyId, data, deletedAt: new Date().toISOString() };
  DATA.trash = [item].concat(DATA.trash || []);
  enqueue('trash', { trash: trashToRow(item), deletes });
}

const journeyLabel = jid => { const j = getJourney(jid); return j ? journeyInfo(j).title : '여행'; };
const isLastMember = t => !!(t.journeyId && getJourney(t.journeyId) && membersOf(t.journeyId).length === 1);

/** 여행 통째로 (일행 기록을 먼저 지우고 여행을 지우면 가계부·일정·정산·준비물은 DB가 같이 지움) */
function trashJourney(jid) {
  sendToTrash('journey', journeyLabel(jid), jid, journeyBundle(jid), [['trips', membersOf(jid).map(t => t.id)], ['journeys', [jid]]]);
}
/** 일행 기록 하나. 그 여행의 마지막 기록이면 여행째로 */
function trashTrip(t) {
  if (!DATA.needsSchema && isLastMember(t)) return trashJourney(t.journeyId);
  const where = t.countries.map(c => c.name).join('·') || '나라 미정';
  sendToTrash('trip', `${t.person} · ${where} ${dot(t.dep)}`, t.journeyId || '', { trips: [tripToRow(t)] }, [['trips', [t.id]]]);
}
function trashExpense(e) {
  sendToTrash('expense', `${e.title || expCat(e.category).name} ${money(e.amount, e.currency)}`, e.journeyId, { expenses: [expenseToRow(e)] }, [['expenses', [e.id]]]);
}
function trashFlight(f) {
  sendToTrash('flight', `${f.flightNo || '항공편'} ${f.dep.iata}→${f.arr.iata} ${md(f.dep.time)}`, f.journeyId, { flights: [flightToRow(f)] }, [['flights', [f.id]]]);
}
function trashStay(x) {
  sendToTrash('stay', `${x.name} ${md(x.checkIn)}~${md(x.checkOut)}`, x.journeyId, { stays: [stayToRow(x)] }, [['stays', [x.id]]]);
}
function trashPlace(p) {
  sendToTrash('place', p.name, p.journeyId, { places: [placeToRow(p)] }, [['places', [p.id]]]);
}

/** 줄들을 화면 DATA에 넣음 (이미 있는 ID는 건너뜀) */
function addRowsLocal(data) {
  TABLE_ORDER.forEach(t => {
    const [key, conv] = TABLE_DATA[t];
    const have = new Set((DATA[key] || []).map(x => x.id));
    DATA[key] = (DATA[key] || []).concat((data[t] || []).map(conv).filter(x => !have.has(x.id)));
  });
}
const tripClash = r => DATA.trips.find(t => t.id !== String(r.id) && t.person === r.person && t.dep === String(r.dep).slice(0, 10));

function restoreTrash(id) {
  const item = (DATA.trash || []).find(x => x.id === id);
  if (!item) return;
  const d = JSON.parse(JSON.stringify(item.data));
  const clash = (d.trips || []).map(tripClash).filter(Boolean);
  if (clash.length) return toast(`${clash.map(t => `${t.person} ${dot(t.dep)}`).join(', ')} 출국 기록이 이미 있어서 되살릴 수 없어요. 그 기록을 먼저 지워 주세요`);
  const hasJourney = jid => !!getJourney(jid) || (d.journeys || []).some(j => j.id === jid);
  (d.trips || []).forEach(r => { if (r.journey_id && !hasJourney(r.journey_id)) r.journey_id = null; });   // 여행이 없어졌으면 혼자 (자동으로 다시 묶임)
  const orphan = ['flights', 'stays', 'expenses', 'places', 'settle_checks', 'pack_items', 'pack_checks'].some(t => (d[t] || []).some(r => !hasJourney(r.journey_id)));
  if (orphan) return toast('이 기록이 있던 여행이 지금 없어요. 휴지통에서 그 여행을 먼저 되살려 주세요');
  addRowsLocal(d);
  DATA.trash = DATA.trash.filter(x => x.id !== id);
  enqueue('restore', { upserts: TABLE_ORDER.map(t => [t, d[t] || []]).filter(x => x[1].length), trashId: id });
  afterLocalChange(); toast(`되살렸어요: ${item.label}`);
}

function purgeTrash(id) {
  const item = (DATA.trash || []).find(x => x.id === id);
  if (!item || !confirm(`"${item.label}"을(를) 휴지통에서 완전히 지울까요? 다시 되살릴 수 없어요.`)) return;
  DATA.trash = DATA.trash.filter(x => x.id !== id);
  removeRow('trash', id);
  afterLocalChange();
}

function trashSummary(d) {
  const n = t => (d[t] || []).length;
  return [n('trips') && `일행 기록 ${n('trips')}`, n('flights') && `항공편 ${n('flights')}`, n('stays') && `숙소 ${n('stays')}`,
    n('expenses') && `지출 ${n('expenses')}`, n('places') && `일정 ${n('places')}`,
    n('pack_items') && `준비물 ${n('pack_items')}`].filter(Boolean).join(' · ');
}
function renderTrash() {
  const box = $('trashBox');
  if (!box || !DATA) return;
  if (DATA.noStep4) { box.innerHTML = '<div class="note">휴지통을 쓰려면 Supabase SQL Editor에서 schema.sql을 다시 실행해 주세요. (그 전에는 지우면 바로 없어져요)</div>'; return; }
  const list = (DATA.trash || []).slice().sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  box.innerHTML = list.length ? list.map(x => {
    const when = x.deletedAt ? new Date(x.deletedAt) : null;
    return `<div class="mrow">
      <div style="flex:1;min-width:0"><b>${esc(x.label || '(이름 없음)')}</b>
        <div class="who">${KIND_NAME[x.kind] || ''}${when ? ` · ${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')} 삭제` : ''}${x.kind === 'journey' && trashSummary(x.data) ? ' · ' + trashSummary(x.data) : ''}</div></div>
      <button class="btn small" data-restore="${esc(x.id)}">되살리기</button>
      <button class="btn ghost small" data-purge="${esc(x.id)}" title="완전히 지우기">완전 삭제</button>
    </div>`;
  }).join('') + '<div class="note">휴지통은 자동으로 비우지 않아요.</div>' : '<div class="note">비어 있어요. 지운 여행·지출·일정은 여기로 와요.</div>';
  box.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => restoreTrash(b.dataset.restore));
  box.querySelectorAll('[data-purge]').forEach(b => b.onclick = () => purgeTrash(b.dataset.purge));
}

/* ───────── 📦 전체 백업 ───────── */
function downloadBackup() {
  if (!DATA) return;
  const tables = {};
  TABLE_ORDER.forEach(t => {
    const [key] = TABLE_DATA[t];
    const toRow = { journeys: journeyToRow, trips: tripToRow, expenses: expenseToRow, places: placeToRow, settle_checks: checkToRow,
      pack_items: packItemToRow, pack_checks: packCheckToRow, flights: flightToRow, stays: stayToRow }[t];
    tables[t] = (DATA[key] || []).map(toRow);
  });
  tables.trash = (DATA.trash || []).map(trashToRow);
  const body = JSON.stringify({ app: 'family-travel', version: 1, exportedAt: new Date().toISOString(), tables }, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `family-travel-backup_${todayIso().replace(/-/g, '')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`백업 파일을 내려받았어요 (여행 ${tables.journeys.length} · 기록 ${tables.trips.length} · 지출 ${tables.expenses.length})`);
}

/** 백업 파일에서 지금 없는 줄만 골라 다시 넣음. 휴지통에 있는 건 (일부러 지운 것이니) 빼고 */
function restoreFromBackup(text) {
  let file;
  try { file = JSON.parse(text); } catch (e) { return toast('백업 파일을 읽을 수 없어요'); }
  if (!file || file.app !== 'family-travel' || !file.tables) return toast('우리 가족 여행기록 백업 파일이 아니에요');
  const inTrash = new Set();
  (DATA.trash || []).forEach(x => TABLE_ORDER.forEach(t => (x.data[t] || []).forEach(r => inTrash.add(t + ':' + r.id))));
  const add = {};
  const haveJourney = jid => !!getJourney(jid) || (add.journeys || []).some(j => j.id === jid);
  TABLE_ORDER.forEach(t => {
    const have = new Set((DATA[TABLE_DATA[t][0]] || []).map(x => x.id));
    add[t] = (file.tables[t] || []).filter(r => r && r.id != null && !have.has(String(r.id)) && !inTrash.has(t + ':' + r.id));
  });
  add.trips = add.trips.filter(r => !tripClash(r)).map(r => (r.journey_id && !haveJourney(r.journey_id) ? Object.assign({}, r, { journey_id: null }) : r));
  ['flights', 'stays', 'expenses', 'places', 'settle_checks', 'pack_items'].forEach(t => { add[t] = add[t].filter(r => haveJourney(r.journey_id)); });
  const items = new Set((DATA.packItems || []).map(x => x.id).concat(add.pack_items.map(r => String(r.id))));
  add.pack_checks = add.pack_checks.filter(r => haveJourney(r.journey_id) && items.has(String(r.item_id)));
  const trashHave = new Set((DATA.trash || []).map(x => x.id));
  const addTrash = (file.tables.trash || []).filter(r => r && r.id != null && !trashHave.has(String(r.id)));
  const names = { journeys: '여행', trips: '일행 기록', flights: '항공편', stays: '숙소', expenses: '지출', places: '일정', settle_checks: '정산 체크', pack_items: '준비물', pack_checks: '준비물 체크' };
  const parts = TABLE_ORDER.filter(t => add[t].length).map(t => `${names[t]} ${add[t].length}`).concat(addTrash.length ? [`휴지통 ${addTrash.length}`] : []);
  if (!parts.length) return toast('빠진 기록이 없어요 👍 지금 기록이 백업보다 같거나 많아요');
  const when = String(file.exportedAt || '').slice(0, 10);
  if (!confirm(`${when ? when + ' 백업에서 ' : ''}지금 없는 기록을 채울까요?\n\n${parts.join('\n')}\n\n지금 있는 기록은 바뀌지 않아요.`)) return;
  addRowsLocal(add);
  DATA.trash = (DATA.trash || []).concat(addTrash.map(rowToTrash));
  enqueue('restore', { upserts: TABLE_ORDER.map(t => [t, add[t]]).filter(x => x[1].length).concat(addTrash.length ? [['trash', addTrash]] : []) });
  afterLocalChange(); toast('백업에서 채웠어요');
}

$('backupBtn').onclick = downloadBackup;
$('restoreBtn').onclick = () => { if (DATA) $('restoreFile').click(); };
$('restoreFile').onchange = async () => {
  const f = $('restoreFile').files[0];
  $('restoreFile').value = '';
  if (f) restoreFromBackup(await f.text());
};
