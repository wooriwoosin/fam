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

-- ═════════════════════════════════════════════════════════════════════
-- 여행 묶음 · 가계부 · 장소 · 정산 (2단계 업데이트) — 위와 함께 통째로 다시 실행해도 안전
-- ═════════════════════════════════════════════════════════════════════

-- 같이 간 여행 하나 (일행마다 출국·입국일이 달라도 하나로 묶음). 기간·나라는 일행 기록에서 계산
create table if not exists public.journeys (
  id          text primary key,
  title       text not null default '',                 -- 비우면 화면이 "🇻🇳 다낭 여행"처럼 만들어 줌
  guests      jsonb not null default '[]'::jsonb,       -- 가족 외 일행 이름들 (정산에만 참여)
  memo        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint journeys_guests_is_array check (jsonb_typeof(guests) = 'array')
);

alter table public.trips add column if not exists journey_id text references public.journeys(id) on delete set null;
create index if not exists trips_journey_idx on public.trips (journey_id);

-- 가계부: 지출 한 건 (현지화폐 + 원화)
create table if not exists public.expenses (
  id          text primary key,
  journey_id  text not null references public.journeys(id) on delete cascade,
  paid_on     date not null,                            -- 결제일 (여행 전 결제도 OK)
  category    text not null default 'etc',              -- flight / stay / food / cafe / transport / tour / shopping / etc
  title       text not null default '',                 -- 아시아나항공, 아고다, 이치란 라멘 …
  amount      numeric(16,2) not null,                   -- 결제 통화 금액
  currency    text not null default 'KRW',              -- JPY, VND, USD …
  fx_rate     numeric(18,8),                            -- 1 단위당 원화 (결제일 기준 자동, 수정 가능)
  krw         numeric(16,0) not null,                   -- 원화 금액 (카드 청구액으로 덮어쓸 수 있음)
  krw_manual  boolean not null default false,           -- true면 카드 청구 원화를 직접 넣은 것
  payer       text not null default '',                 -- 결제한 사람
  method      text not null default '',                 -- 결제수단 메모 (민정 현대카드, 현금 …)
  split_with  jsonb not null default '[]'::jsonb,       -- 함께 쓴 사람 (비면 일행 전체)
  personal    boolean not null default false,           -- 개인 지출 (정산에서 빠짐)
  place_id    text,                                     -- 연결된 장소 (선택)
  memo        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint expenses_split_is_array check (jsonb_typeof(split_with) = 'array')
);
create index if not exists expenses_journey_idx on public.expenses (journey_id, paid_on);

-- 장소 기록 (구글지도)
create table if not exists public.places (
  id               text primary key,
  journey_id       text not null references public.journeys(id) on delete cascade,
  visited_on       date,
  name             text not null,
  category         text not null default 'etc',         -- food / cafe / bar / sight / shopping / stay / etc
  google_place_id  text,
  lat              double precision,
  lng              double precision,
  address          text not null default '',
  rating           smallint check (rating between 1 and 5),   -- 우리 가족 별점
  memo             text not null default '',
  added_by         text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists places_journey_idx on public.places (journey_id, visited_on);

-- 정산 체크리스트 (누가 누구에게 얼마 보냈는지 체크)
create table if not exists public.settle_checks (
  id           text primary key,                        -- 여행ID|보내는 사람|받는 사람
  journey_id   text not null references public.journeys(id) on delete cascade,
  from_person  text not null,
  to_person    text not null,
  amount       numeric(16,0) not null,                  -- 체크할 때의 금액 (바뀌면 화면이 알려 줌)
  checked_at   timestamptz not null default now()
);

-- 수정 시각 자동 갱신 + 공개 정책 (trips와 같은 방식)
do $$
declare t text;
begin
  foreach t in array array['journeys', 'expenses', 'places'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
  foreach t in array array['journeys', 'expenses', 'places', 'settle_checks'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "공개 읽기" on public.%s', t);
    execute format('drop policy if exists "공개 추가" on public.%s', t);
    execute format('drop policy if exists "공개 수정" on public.%s', t);
    execute format('drop policy if exists "공개 삭제" on public.%s', t);
    execute format('create policy "공개 읽기" on public.%s for select to anon, authenticated using (true)', t);
    execute format('create policy "공개 추가" on public.%s for insert to anon, authenticated with check (true)', t);
    execute format('create policy "공개 수정" on public.%s for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "공개 삭제" on public.%s for delete to anon, authenticated using (true)', t);
    execute format('grant select, insert, update, delete on public.%s to anon, authenticated', t);
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════
-- 같은 날 안에서의 순서 (가계부·장소 "순서 바꾸기") — 다시 실행해도 안전
-- 기존 기록은 입력한 순서(created_at)대로 1000, 2000, 3000 … 으로 채움
-- ═════════════════════════════════════════════════════════════════════
alter table public.expenses add column if not exists sort_order double precision;
alter table public.places   add column if not exists sort_order double precision;

update public.expenses e set sort_order = s.n
  from (select id, row_number() over (partition by journey_id, paid_on order by created_at, id) * 1000 as n from public.expenses) s
 where e.id = s.id and e.sort_order is null;

update public.places p set sort_order = s.n
  from (select id, row_number() over (partition by journey_id, visited_on order by created_at, id) * 1000 as n from public.places) s
 where p.id = s.id and p.sort_order is null;
