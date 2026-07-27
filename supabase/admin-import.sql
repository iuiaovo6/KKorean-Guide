-- Talk Guide: add one administrator and protect the public word library.
-- Run this once in Supabase Dashboard > SQL Editor.

alter table public.profiles
add column if not exists is_admin boolean not null default false;

drop policy if exists "Admins can insert words" on public.words;
create policy "Admins can insert words"
on public.words for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_admin = true
  )
);

drop policy if exists "Admins can update words" on public.words;
create policy "Admins can update words"
on public.words for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_admin = true
  )
);

drop policy if exists "Admins can delete words" on public.words;
create policy "Admins can delete words"
on public.words for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_admin = true
  )
);

-- Replace the text below with the email you use to log in, then run this file.
update public.profiles
set is_admin = true,
    updated_at = now()
where id = (
  select id from auth.users
  where email = '把这里换成你的登录邮箱'
);
