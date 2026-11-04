-- Ejecutar una vez en Supabase: SQL Editor -> New query -> Run
-- Enlace privado de suscripcion para Apple Calendar (un token secreto por usuario)

create table if not exists public.feed_tokens (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

alter table public.feed_tokens enable row level security;

drop policy if exists "own token select" on public.feed_tokens;
drop policy if exists "own token insert" on public.feed_tokens;
drop policy if exists "own token delete" on public.feed_tokens;

create policy "own token select" on public.feed_tokens for select to authenticated using (user_id = auth.uid());
create policy "own token insert" on public.feed_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "own token delete" on public.feed_tokens for delete to authenticated using (user_id = auth.uid());

-- Devuelve solo los eventos del dueño del token (no expone el id de usuario)
create or replace function public.feed_events(p_token text)
returns table (id uuid, title text, cal text, date date, start_time time, end_time time, notes text)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.cal, e.date, e.start_time, e.end_time, e.notes
  from public.events e
  join public.feed_tokens t on t.user_id = e.user_id
  where t.token = p_token
$$;

revoke all on function public.feed_events(text) from public;
grant execute on function public.feed_events(text) to anon, authenticated;
