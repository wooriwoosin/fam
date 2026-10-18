-- 우리 가족 여행기록 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 접근: 완전 공개 (로그인·비밀번호 없음). 화면(GitHub Pages)이 anon 키로 직접 읽고 씁니다.
-- 나중에 가족만 보게 하려면 아래 "공개 정책" 4개를 지우고 다른 정책으로 바꾸면 됩니다.

create table if not exists public.trips (
  id          text primary key,                         -- 화면에서 만든 ID (같은 저장이 두 번 와도 한 번만)
  person      text not null,                            -- 여행자 (전정순 / 허인선 / 허형준 / 김민정)
  dep         date not null,                            -- 출국일 (오늘 이후면 '예정 여행')
  ret         date,                                     -- 입국일
  countries   jsonb not null default '[]'::jsonb,       -- [{"name":"일본","code":"JP","cities":["오사카","교토"]}]
  memo        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint trips_ret_after_dep check (ret is null or ret >= dep),
  constraint trips_countries_is_array check (jsonb_typeof(countries) = 'array'),
  constraint trips_person_dep_unique unique (person, dep)  -- 같은 사람·같은 출국일은 한 번만 (증명서 중복 방지)
);

create index if not exists trips_dep_idx on public.trips (dep desc);

-- 수정 시각 자동 갱신
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trips_touch on public.trips;
create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

-- 행 단위 보안(RLS)은 켜 두고, 공개 정책으로 누구나 읽고 쓰게 함
alter table public.trips enable row level security;

drop policy if exists "공개 읽기" on public.trips;
drop policy if exists "공개 추가" on public.trips;
drop policy if exists "공개 수정" on public.trips;
drop policy if exists "공개 삭제" on public.trips;
create policy "공개 읽기" on public.trips for select to anon, authenticated using (true);
create policy "공개 추가" on public.trips for insert to anon, authenticated with check (true);
create policy "공개 수정" on public.trips for update to anon, authenticated using (true) with check (true);
create policy "공개 삭제" on public.trips for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.trips to anon, authenticated;
