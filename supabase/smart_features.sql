-- Tablas auxiliares para organizador inteligente, vaciado mental y tareas
create table if not exists public.brain_dump (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  cal text not null default 'pers',
  estimated_mins int not null default 30,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.brain_dump enable row level security;
drop policy if exists "own brain_dump" on public.brain_dump;
create policy "own brain_dump" on public.brain_dump for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_title text not null,
  exam_date date not null,
  num_topics int not null,
  difficulty text not null default 'medio',
  daily_hours numeric not null default 2,
  created_at timestamptz not null default now()
);

alter table public.study_plans enable row level security;
drop policy if exists "own study_plans" on public.study_plans;
create policy "own study_plans" on public.study_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
