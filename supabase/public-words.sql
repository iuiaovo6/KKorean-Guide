-- Allow anyone to browse the shared vocabulary library without signing in.
-- Run this once in Supabase Dashboard > SQL Editor.

drop policy if exists "Signed-in users can read words" on public.words;
drop policy if exists "Anyone can read words" on public.words;

create policy "Anyone can read words"
on public.words for select
to anon, authenticated
using (true);
