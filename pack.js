/**
 * 🎒 준비물 체크리스트 (여행 상세 → 💸 정산·준비 → 🎒 준비물)
 *
 * - 여행마다 목록 하나 (pack_items). 처음엔 기본 목록이나 지난 여행 목록으로 시작, 항목·파우치·묶음은 자유롭게 추가·삭제
 * - 체크는 가족 공통 하나 (pack_checks, ID = 항목ID|공통). 항목마다 따로 저장해서 동시에 체크해도 서로 안 덮어씀
 */

// 기본 목록: [묶음, [[파우치('' = 없음), '항목|항목|…'], …]]
const PACK_TEMPLATE = [
  ['✅ 출국 전 최종 확인', [['', '통신 예약 (유심 / 와이파이 / 로밍)|여행자 보험 가입|오프라인 콘텐츠 다운로드 (지도, 가이드, 유튜브, 넷플릭스)|이용 항공사 수하물 규정 (무게, 크기) 최종 확인']]],
  ['🎒 몸에 항상 소지하는 가방 (복대·크로스백)', [['', '여권 (사본, 여권/증명사진 여분 포함)|비자|항공 E-티켓 (항공편명 기록, 출력본)|숙소 바우처 (캡쳐본), 현지 투어 바우처|수첩 및 볼펜 (입국신고서 작성용)|현지 현금|해외 결제용 신용카드|스프링 줄 및 미니 카라비너 (도난 방지용)']]],
  ['✈️ 기내 반입 수하물 (백팩·기내용 캐리어)', [['', '보조배터리|태블릿|핸드폰 충전기, USB 케이블, 올인원 충전 케이블|워치 충전기|유선 이어폰|에어팟|목베개|수면안대|기내마스크|귀마개|핫팩|온열기 (전기방석/히팅매트)|기내 액체류 지퍼백 (100ml 미만만 가능)|미스트|립밤 및 틴트|인공눈물|치약|칫솔|치실|포켓티슈 / 소독티슈|물티슈|일회용 얼굴 수건 (기내 사용분 소량)|귀중품 (악세사리)|안경 및 렌즈|상비약 (소화제, 두통약 등)|즉석카메라 및 필름 (X-ray 훼손 방지, 기내 지참)|패커블 보조 가방']]],
  ['🧳 위탁 수하물', [
    ['의류 압축 파우치', '상의|하의|얇은 긴팔 셔츠 및 바람막이|잠옷|방한용품 (목도리, 장갑)|모자|헬스복|헬스장갑'],
    ['속옷 및 양말 파우치', '속옷|양말|스타킹|압박스타킹|무릎밴드'],
    ['신발 파우치 (더스트백)', '운동화|슬리퍼 (또는 쪼리) / 일회용 슬리퍼|러닝화'],
    ['세면 및 샤워 파우치 (방수 재질)', '미니 샤워기 필터|샴푸|트리트먼트|바디워시 (고체형 추천)|샤워타월|클렌징 오일|클렌징 폼|바디샤워 물티슈|스포츠 타월|일회용 페이스 타월 (잔여분)'],
    ['화장품 파우치', '기초 화장품 (스킨, 로션, 크림, 수딩젤)|선케어|색조 화장품|마스크팩|바디로션|향수|헤어 에센스|헤어 왁스|빗|머리끈|세안밴드|손거울|면봉'],
    ['의약품 지퍼백', '종합감기약|테라플루 나이트|지사제|소화제|진통해열제|멀미약|상처연고 (후시딘)|반창고|버물리|모기 기피제|바이트 패치|비판텐|살충제 (베드버그)|개인약'],
    ['식품 및 취사 파우치', '라면포트|비비고김치|컵라면 (열누들)|봉지라면|컵밥|고추장 튜브|팔도비빔장|김자반|참/들/깨|사골곰탕|생수|커피|율무차|일회용 수세미|종이컵|일회용 포크|일회용 수저|애사비'],
    ['전자기기 및 가전 파우치 (위탁용)', '헤어드라이기|고데기 (프리볼트)|에어랩|집게핀|멀티탭|변환 어댑터 (돼지코)|홈매트 (모기향)|포켓 전기장판'],
    ['물놀이 메쉬 파우치 (통풍 재질)', '래쉬가드|수영복|비치웨어|아쿠아슈즈|아쿠아타올|튜브 및 암튜브|수경|스노클링 장비 (물안경)|방수팩|니플패치'],
    ['잡화 지퍼백', '미니 가위 (위탁 필수)|칼 (위탁 필수)|삼각대 및 셀카봉|초경량 양우산|우비|선글라스|돗자리|손톱깎기|반짓고리|여성용품|종이 세제|여분의 지퍼백|비닐봉지'],
  ]],
];
const templateCount = () => PACK_TEMPLATE.reduce((n, [, pouches]) => n + pouches.reduce((m, [, list]) => m + list.split('|').length, 0), 0);

let settleView = '';       // '' = 여행마다 자동 (출발 전이면 준비물, 다녀온 뒤면 정산) | 'money' | 'pack'
let settleViewFor = '';
const PACK_ALL = '공통';   // 체크는 가족 공통 하나
let packEdit = false;      // ✏️ 목록 편집 중
let packHideDone = false;  // 남은 것만 보기

function rowToPackItem(r) {
  return { id: String(r.id), journeyId: r.journey_id, section: r.section || '', pouch: r.pouch || '', name: r.name || '',
    sortOrder: r.sort_order == null ? null : Number(r.sort_order) };
}
const packItemToRow = x => ({ id: x.id, journey_id: x.journeyId, section: x.section, pouch: x.pouch || '', name: x.name, sort_order: x.sortOrder });
function rowToPackCheck(r) { return { id: String(r.id), journeyId: r.journey_id, itemId: String(r.item_id), person: r.person, checked: r.checked !== false }; }
const packCheckToRow = c => ({ id: c.id, journey_id: c.journeyId, item_id: c.itemId, person: c.person, checked: c.checked });

const packOf = jid => (DATA.packItems || []).filter(x => x.journeyId === jid)
  .sort((a, b) => ((a.sortOrder == null ? Infinity : a.sortOrder) - (b.sortOrder == null ? Infinity : b.sortOrder)) || (a.id < b.id ? -1 : 1));
/** 공통 체크가 있으면 그걸로, 없으면 예전(사람마다 체크하던 때) 체크 중 하나라도 있으면 체크된 걸로 */
function isChecked(itemId) {
  const cs = (DATA.packChecks || []).filter(c => c.itemId === itemId);
  const common = cs.find(c => c.person === PACK_ALL);
  return common ? common.checked : cs.some(c => c.checked);
}

/** 정산·준비 탭: 위에 [💸 정산 | 🎒 준비물] 고르기 */
function renderSettleOrPack(i) {
  if (settleViewFor !== i.journey.id) { settleViewFor = i.journey.id; settleView = ''; packEdit = false; }
  const view = settleView || (i.planned || (i.ret || i.dep) >= todayIso() ? 'pack' : 'money');
  if (view === 'money') renderSettle(i); else renderPack(i);
  const items = packOf(i.journey.id);
  const done = items.filter(x => isChecked(x.id)).length;
  $('jBody').insertAdjacentHTML('afterbegin', `<div class="seg">
    <button class="${view === 'money' ? 'on' : ''}" data-view="money">💸 정산</button>
    <button class="${view === 'pack' ? 'on' : ''}" data-view="pack">🎒 준비물${items.length ? ` <small>${done}/${items.length}</small>` : ''}</button></div>`);
  $('jBody').querySelectorAll('[data-view]').forEach(b => b.onclick = () => { settleView = b.dataset.view; renderJourney(); });
}

function newPackItems(jid, source) {
  return source.map(x => ({ id: 'pk_' + newId(), journeyId: jid, section: x.section, pouch: x.pouch, name: x.name, sortOrder: x.sortOrder }));
}
function startPack(jid, items) {
  DATA.packItems = (DATA.packItems || []).concat(items);
  saveRows('pack_items', items.map(packItemToRow));
  afterLocalChange();
}

function renderPack(i) {
  const j = i.journey;
  if (DATA.noStep4) {
    $('jBody').innerHTML = '<div class="card privacy" style="background:#fff4c2;color:#6b4e00">⚠️ 준비물 체크리스트를 쓰려면 Supabase SQL Editor에서 <b>schema.sql</b>을 다시 실행해 주세요.</div>';
    return;
  }
  const items = packOf(j.id);

  if (!items.length && !packEdit) {
    // 지난 여행 중 목록이 있는 가장 최근 여행
    const prev = (DATA.journeys || []).filter(x => x.id !== j.id && packOf(x.id).length).map(journeyInfo)
      .sort((a, b) => (a.dep < b.dep ? 1 : -1))[0];
    $('jBody').innerHTML = `<div class="card">
      <h3 class="ch">🎒 준비물 체크리스트</h3>
      <div class="note" style="margin-top:0">목록과 체크는 이 여행 일행이 같이 써요. 시작한 뒤에 항목을 마음대로 더하고 뺄 수 있어요.</div>
      <div class="actions" style="flex-direction:column;align-items:stretch">
        <button class="btn" id="pkTpl">✈️ 기본 목록으로 시작 (${templateCount()}개)</button>
        ${prev ? `<button class="btn ghost" id="pkPrev">📋 지난 여행 목록 가져오기 · ${esc(prev.title)} (${packOf(prev.journey.id).length}개)</button>` : ''}
        <button class="btn ghost" id="pkEmpty">✏️ 빈 목록에서 직접 만들기</button>
      </div></div>`;
    $('pkTpl').onclick = () => {
      let n = 0;
      const src = [];
      PACK_TEMPLATE.forEach(([section, pouches]) => pouches.forEach(([pouch, list]) => list.split('|').forEach(name => src.push({ section, pouch, name, sortOrder: ++n * 1000 }))));
      startPack(j.id, newPackItems(j.id, src)); toast('기본 목록을 넣었어요 🎒');
    };
    if ($('pkPrev')) $('pkPrev').onclick = () => { startPack(j.id, newPackItems(j.id, packOf(prev.journey.id))); toast('지난 여행 목록을 가져왔어요 (체크는 비운 채)'); };
    $('pkEmpty').onclick = () => { packEdit = true; renderJourney(); };
    return;
  }

  // 묶음 → 파우치 → 항목 (목록 순서 그대로)
  const sections = [];
  items.forEach(x => {
    let sec = sections.find(s => s.name === x.section);
    if (!sec) sections.push(sec = { name: x.section, pouches: [] });
    let po = sec.pouches.find(p => p.name === x.pouch);
    if (!po) sec.pouches.push(po = { name: x.pouch, items: [] });
    po.items.push(x);
  });
  const total = items.length;
  const doneOf = list => list.filter(x => isChecked(x.id)).length;
  const done = doneOf(items);
  const pct = total ? Math.round(done / total * 100) : 0;
  const addRow = (sec, pouch) => `<div class="pkadd"><input type="text" data-addsec="${esc(sec)}" data-addpouch="${esc(pouch)}" placeholder="＋ 항목 추가 (쉼표로 여러 개)" enterkeyhint="done"><button class="btn ghost small" data-addbtn>추가</button></div>`;

  $('jBody').innerHTML = `
    <div class="card pkhead">
      <div class="pkbar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="pkmeta"><span><b>${done}/${total}</b> 챙김${done === total && total ? ' 🎉' : ''}</span>
        <span class="pktools">
          ${packEdit ? '' : `<button class="btn ghost small ${packHideDone ? 'on' : ''}" id="pkHide">${packHideDone ? '전체 보기' : '남은 것만'}</button>`}
          <button class="btn ${packEdit ? '' : 'ghost'} small" id="pkEdit">${packEdit ? '✓ 편집 끝' : '✏️ 목록 편집'}</button>
        </span></div>
      ${packEdit ? '<div class="note">× 를 누르면 바로 빠져요. 항목은 쉼표(,)로 여러 개를 한 번에 넣을 수 있어요.</div>' : ''}
    </div>
    ${sections.map(sec => {
      const all = sec.pouches.flatMap(p => p.items);
      const secDone = doneOf(all);
      return `<details class="card pksec" open>
        <summary><b>${esc(sec.name || '기타')}</b> <span class="note">${secDone}/${all.length}${secDone === all.length ? ' ✓' : ''}</span></summary>
        ${sec.pouches.map(po => {
          const shown = packEdit || !packHideDone ? po.items : po.items.filter(x => !isChecked(x.id));
          if (!shown.length && !packEdit) return '';
          return `${po.name ? `<div class="pkpouch">👜 ${esc(po.name)} <span class="note">${doneOf(po.items)}/${po.items.length}</span>${packEdit ? `<button class="x" data-delpouch="${esc(sec.name)}|${esc(po.name)}" title="파우치 통째로 빼기">×</button>` : ''}</div>` : ''}
            ${shown.map(x => packEdit
              ? `<div class="pk edit"><span>${esc(x.name)}</span><button class="x" data-delitem="${esc(x.id)}" aria-label="${esc(x.name)} 빼기">×</button></div>`
              : `<label class="pk ${isChecked(x.id) ? 'done' : ''}"><input type="checkbox" data-pk="${esc(x.id)}" ${isChecked(x.id) ? 'checked' : ''}><span>${esc(x.name)}</span></label>`).join('')}
            ${packEdit ? addRow(sec.name, po.name) : ''}`;
        }).join('') || (packHideDone ? '<div class="note">다 챙겼어요 ✓</div>' : '')}
        ${packEdit ? `<div class="actions"><button class="btn ghost small" data-newpouch="${esc(sec.name)}">＋ 파우치 추가</button>
          <button class="btn ghost small danger-text" data-delsec="${esc(sec.name)}">묶음 삭제</button></div>` : ''}
      </details>`;
    }).join('')}
    ${packEdit ? `<div class="card"><div class="actions" style="margin-top:0;flex-direction:column;align-items:stretch">
      <button class="btn ghost" id="pkNewSec">＋ 묶음 추가 (예: 👶 아기 용품)</button>
      ${items.length ? '<button class="btn ghost danger-text" id="pkReset">🔄 목록 비우고 처음부터 다시 만들기</button>' : ''}</div></div>` : ''}`;

  if ($('pkHide')) $('pkHide').onclick = () => { packHideDone = !packHideDone; renderJourney(); };
  $('pkEdit').onclick = () => { packEdit = !packEdit; renderJourney(); };

  $('jBody').querySelectorAll('[data-pk]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.pk + '|' + PACK_ALL;
    const c = { id, journeyId: j.id, itemId: cb.dataset.pk, person: PACK_ALL, checked: cb.checked };
    DATA.packChecks = (DATA.packChecks || []).filter(x => x.id !== id).concat(c);
    saveRows('pack_checks', [packCheckToRow(c)]);
    const y = window.scrollY;
    afterLocalChange(); window.scrollTo(0, y);
  });

  const removeItems = ids => {
    if (!ids.length) return;
    const set = new Set(ids);
    DATA.packItems = DATA.packItems.filter(x => !set.has(x.id));
    DATA.packChecks = (DATA.packChecks || []).filter(c => !set.has(c.itemId));
    enqueue('trash', { deletes: [['pack_items', ids]] });   // 체크는 DB가 같이 지움
    const y = window.scrollY; afterLocalChange(); window.scrollTo(0, y);
  };
  $('jBody').querySelectorAll('[data-delitem]').forEach(b => b.onclick = () => removeItems([b.dataset.delitem]));
  $('jBody').querySelectorAll('[data-delpouch]').forEach(b => b.onclick = () => {
    const [sec, pouch] = b.dataset.delpouch.split('|');
    const ids = items.filter(x => x.section === sec && x.pouch === pouch).map(x => x.id);
    if (confirm(`"${pouch}" 파우치 항목 ${ids.length}개를 모두 뺄까요?`)) removeItems(ids);
  });
  $('jBody').querySelectorAll('[data-delsec]').forEach(b => b.onclick = () => {
    const ids = items.filter(x => x.section === b.dataset.delsec).map(x => x.id);
    if (confirm(`"${b.dataset.delsec}" 묶음 항목 ${ids.length}개를 모두 뺄까요?`)) removeItems(ids);
  });

  // 항목 추가: 같은 파우치 맨 뒤에 (쉼표로 여러 개)
  const addItems = (sec, pouch, text, focusAfter) => {
    const names = text.split(/[,，\n]/).map(x => x.trim()).filter(Boolean);
    if (!names.length) return;
    const all = packOf(j.id);
    const same = all.filter(x => x.section === sec && x.pouch === pouch);
    const inSec = all.filter(x => x.section === sec);
    let base = same.length ? same[same.length - 1].sortOrder : inSec.length ? Math.max(...inSec.map(x => x.sortOrder || 0)) : Math.max(0, ...all.map(x => x.sortOrder || 0)) + 1000;
    // 바로 뒤 항목과 겹치지 않게 그 사이에 넣음
    const next = all.find(x => (x.sortOrder || 0) > base);
    const step = next ? ((next.sortOrder - base) / (names.length + 1)) : 1;
    const added = names.map(name => ({ id: 'pk_' + newId(), journeyId: j.id, section: sec, pouch, name, sortOrder: (base += step) }));
    DATA.packItems = (DATA.packItems || []).concat(added);
    saveRows('pack_items', added.map(packItemToRow));
    const y = window.scrollY; afterLocalChange(); window.scrollTo(0, y);
    if (focusAfter) { const el = [...$('jBody').querySelectorAll('[data-addsec]')].find(x => x.dataset.addsec === sec && x.dataset.addpouch === pouch); if (el) el.focus(); }
  };
  $('jBody').querySelectorAll('[data-addsec]').forEach(inp => {
    const go = () => addItems(inp.dataset.addsec, inp.dataset.addpouch, inp.value, true);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    inp.nextElementSibling.onclick = go;
  });
  $('jBody').querySelectorAll('[data-newpouch]').forEach(b => b.onclick = () => {
    const pouch = (prompt('파우치 이름 (예: 카메라 파우치)') || '').trim();
    if (!pouch) return;
    const first = (prompt(`"${pouch}"에 넣을 항목 (쉼표로 여러 개)`) || '').trim();
    if (first) addItems(b.dataset.newpouch, pouch, first);
  });
  if ($('pkReset')) $('pkReset').onclick = () => {
    if (!confirm(`준비물 ${items.length}개와 체크를 모두 지우고, 기본 목록이나 지난 여행 목록으로 다시 시작할까요?`)) return;
    packEdit = false; removeItems(items.map(x => x.id));
  };
  if ($('pkNewSec')) $('pkNewSec').onclick = () => {
    const sec = (prompt('묶음 이름 (예: 👶 아기 용품)') || '').trim();
    if (!sec) return;
    const first = (prompt(`"${sec}"에 넣을 항목 (쉼표로 여러 개)`) || '').trim();
    if (first) addItems(sec, '', first);
  };
}
