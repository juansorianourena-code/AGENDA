-- Ejecutar en Supabase: SQL Editor -> New query -> Run
-- Modifica la tabla feed_tokens para guardar qué calendarios sincronizar (ej: exam,prac,jmv...)
alter table public.feed_tokens add column if not exists allowed_cals text not null default 'exam,prac,jmv,cat,pers';

-- Modifica la funcion feed_events para filtrar solo los calendarios que el usuario tenga activos para Apple
create or replace function public.feed_events(p_token text)
returns table (id uuid, title text, cal text, date date, start_time time, end_time time, notes text)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.cal, e.date, e.start_time, e.end_time, e.notes
  from public.events e
  join public.feed_tokens t on t.user_id = e.user_id
  where t.token = p_token
    and (e.cal = any(string_to_array(t.allowed_cals, ',')))
$$;
