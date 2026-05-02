create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  animations_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.animation_impressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_key text not null,
  shown_on date not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, trigger_key, shown_on)
);

create index if not exists animation_impressions_user_trigger_idx
  on public.animation_impressions (user_id, trigger_key, shown_on desc);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;
alter table public.animation_impressions enable row level security;

drop policy if exists "Users can select own preferences" on public.user_preferences;
create policy "Users can select own preferences"
on public.user_preferences for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
on public.user_preferences for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
on public.user_preferences for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences"
on public.user_preferences for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can select own animation impressions" on public.animation_impressions;
create policy "Users can select own animation impressions"
on public.animation_impressions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own animation impressions" on public.animation_impressions;
create policy "Users can insert own animation impressions"
on public.animation_impressions for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own animation impressions" on public.animation_impressions;
create policy "Users can update own animation impressions"
on public.animation_impressions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own animation impressions" on public.animation_impressions;
create policy "Users can delete own animation impressions"
on public.animation_impressions for delete
to authenticated
using (auth.uid() = user_id);
