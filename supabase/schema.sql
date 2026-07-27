-- Talk Guide: first database schema
-- Run this file once in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  daily_new_words integer not null default 10 check (daily_new_words between 1 and 100),
  spelling_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.words (
  id bigint generated always as identity primary key,
  korean text not null,
  meaning_zh text not null,
  part_of_speech text,
  example_ko text,
  example_zh text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (korean, meaning_zh)
);

create table if not exists public.user_word_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  meaning_level smallint not null default 0 check (meaning_level between 0 and 5),
  listening_level smallint not null default 0 check (listening_level between 0 and 5),
  spelling_level smallint not null default 0 check (spelling_level between 0 and 5),
  review_count integer not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.profiles enable row level security;
alter table public.words enable row level security;
alter table public.user_word_progress enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Signed-in users can read words" on public.words;
create policy "Signed-in users can read words"
on public.words for select
to authenticated
using (true);

drop policy if exists "Users can read their own progress" on public.user_word_progress;
create policy "Users can read their own progress"
on public.user_word_progress for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own progress" on public.user_word_progress;
create policy "Users can create their own progress"
on public.user_word_progress for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own progress" on public.user_word_progress;
create policy "Users can update their own progress"
on public.user_word_progress for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own progress" on public.user_word_progress;
create policy "Users can delete their own progress"
on public.user_word_progress for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

-- Create profiles for users who signed up before this script was run.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- A tiny starter set so we can verify that reading and saving work.
insert into public.words (korean, meaning_zh, part_of_speech, example_ko, example_zh, tags)
values
  ('설레다', '心动、激动', '动词', '오늘 무대가 너무 설레요.', '今天的舞台让我特别心动。', array['表达感受']),
  ('기대하다', '期待', '动词', '다음 공연도 기대해 주세요.', '也请期待下一场演出。', array['表达感受']),
  ('소중하다', '珍贵、宝贵', '形容词', '여러분은 저에게 정말 소중해요.', '大家对我来说真的很珍贵。', array['感谢粉丝'])
on conflict (korean, meaning_zh) do nothing;
