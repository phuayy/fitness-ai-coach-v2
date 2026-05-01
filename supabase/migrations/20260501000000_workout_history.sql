create extension if not exists pgcrypto;

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_type text not null check (exercise_type in ('squat', 'pushup')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'finished')),
  total_reps integer not null default 0 check (total_reps >= 0),
  valid_reps integer not null default 0 check (valid_reps >= 0 and valid_reps <= total_reps),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  set_number integer not null check (set_number >= 1),
  action text not null check (action in ('squat', 'pushup')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds numeric not null check (duration_seconds >= 0),
  total_reps integer not null default 0 check (total_reps >= 0),
  valid_reps integer not null default 0 check (valid_reps >= 0 and valid_reps <= total_reps),
  created_at timestamptz not null default now(),
  unique (session_id, set_number)
);

create table if not exists public.rep_events (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.workout_sets(id) on delete cascade,
  rep_index integer not null check (rep_index >= 1),
  is_valid boolean not null,
  timestamp_seconds numeric not null check (timestamp_seconds >= 0),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  feedback text not null default '',
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (set_id, rep_index)
);

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

create index if not exists workout_sets_session_number_idx
  on public.workout_sets (session_id, set_number);

create index if not exists rep_events_set_index_idx
  on public.rep_events (set_id, rep_index);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.rep_events enable row level security;

drop policy if exists "Users can select own workout sessions" on public.workout_sessions;
create policy "Users can select own workout sessions"
on public.workout_sessions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own workout sessions" on public.workout_sessions;
create policy "Users can insert own workout sessions"
on public.workout_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own workout sessions" on public.workout_sessions;
create policy "Users can update own workout sessions"
on public.workout_sessions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own workout sessions" on public.workout_sessions;
create policy "Users can delete own workout sessions"
on public.workout_sessions for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own workout sets" on public.workout_sets;
create policy "Users can select own workout sets"
on public.workout_sets for select
using (
  exists (
    select 1
    from public.workout_sessions session
    where session.id = workout_sets.session_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own workout sets" on public.workout_sets;
create policy "Users can insert own workout sets"
on public.workout_sets for insert
with check (
  exists (
    select 1
    from public.workout_sessions session
    where session.id = workout_sets.session_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own workout sets" on public.workout_sets;
create policy "Users can update own workout sets"
on public.workout_sets for update
using (
  exists (
    select 1
    from public.workout_sessions session
    where session.id = workout_sets.session_id
      and session.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions session
    where session.id = workout_sets.session_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own workout sets" on public.workout_sets;
create policy "Users can delete own workout sets"
on public.workout_sets for delete
using (
  exists (
    select 1
    from public.workout_sessions session
    where session.id = workout_sets.session_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can select own rep events" on public.rep_events;
create policy "Users can select own rep events"
on public.rep_events for select
using (
  exists (
    select 1
    from public.workout_sets workout_set
    join public.workout_sessions session on session.id = workout_set.session_id
    where workout_set.id = rep_events.set_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own rep events" on public.rep_events;
create policy "Users can insert own rep events"
on public.rep_events for insert
with check (
  exists (
    select 1
    from public.workout_sets workout_set
    join public.workout_sessions session on session.id = workout_set.session_id
    where workout_set.id = rep_events.set_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own rep events" on public.rep_events;
create policy "Users can update own rep events"
on public.rep_events for update
using (
  exists (
    select 1
    from public.workout_sets workout_set
    join public.workout_sessions session on session.id = workout_set.session_id
    where workout_set.id = rep_events.set_id
      and session.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_sets workout_set
    join public.workout_sessions session on session.id = workout_set.session_id
    where workout_set.id = rep_events.set_id
      and session.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own rep events" on public.rep_events;
create policy "Users can delete own rep events"
on public.rep_events for delete
using (
  exists (
    select 1
    from public.workout_sets workout_set
    join public.workout_sessions session on session.id = workout_set.session_id
    where workout_set.id = rep_events.set_id
      and session.user_id = auth.uid()
  )
);
