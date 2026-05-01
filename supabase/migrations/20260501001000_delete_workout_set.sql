create or replace function public.delete_workout_set_and_update_session(
  p_set_id uuid,
  p_total_reps integer,
  p_valid_reps integer,
  p_duration_seconds numeric default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  select session.id
    into v_session_id
  from public.workout_sets workout_set
  join public.workout_sessions session on session.id = workout_set.session_id
  where workout_set.id = p_set_id
    and session.user_id = auth.uid()
  for update of session;

  if v_session_id is null then
    raise exception 'Workout set was not found for the current user'
      using errcode = 'P0002';
  end if;

  delete from public.workout_sets
  where id = p_set_id;

  update public.workout_sessions
  set
    total_reps = greatest(p_total_reps, 0),
    valid_reps = least(greatest(p_valid_reps, 0), greatest(p_total_reps, 0)),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  where id = v_session_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.delete_workout_set_and_update_session(
  uuid,
  integer,
  integer,
  numeric
) to authenticated;
