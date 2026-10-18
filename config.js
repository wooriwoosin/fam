/**
 * 우리 가족 여행기록 · 설정
 *
 * Supabase 대시보드 → Project Settings → API (또는 API Keys) 에서 복사해 넣으세요.
 * - supabaseUrl: Project URL (https://xxxx.supabase.co)
 * - supabaseKey: anon 키 또는 sb_publishable_ 로 시작하는 키 (공개용이라 여기 둬도 됩니다)
 * ⚠️ service_role / sb_secret_ 키와 DB 비밀번호는 절대 넣지 마세요.
 */
window.FAM_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  family: [
    { name: '전정순', role: '엄마' },
    { name: '허인선', role: '시스터' },
    { name: '허형준', role: '남편' },
    { name: '김민정', role: '나' },
  ],

  // 예전 구글 시트(Apps Script) 주소 — ⚙️ 설정의 "구글 시트에서 옮겨오기"에만 씀. 옮긴 뒤에는 지워도 됩니다.
  oldGasUrl: 'https://script.google.com/macros/s/AKfycbxisKGyYyoV11Pw70RZEYfyTl99QTAY9NYjUJvT5sZNSQdoPpofTFJO8IEFD7cfIM_S/exec',
};
