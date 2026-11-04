-- Ejecutar una vez en Supabase: SQL Editor -> New query -> Run
create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  cal text not null,
  date date not null,
  start_time time,
  end_time time,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists events_user_date_idx on public.events (user_id, date);

alter table public.events enable row level security;

drop policy if exists "own events select" on public.events;
drop policy if exists "own events insert" on public.events;
drop policy if exists "own events update" on public.events;
drop policy if exists "own events delete" on public.events;

create policy "own events select" on public.events for select to authenticated using (user_id = auth.uid());
create policy "own events insert" on public.events for insert to authenticated with check (user_id = auth.uid());
create policy "own events update" on public.events for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own events delete" on public.events for delete to authenticated using (user_id = auth.uid());

-- Actualizacion en tiempo real entre dispositivos
alter publication supabase_realtime add table public.events;
