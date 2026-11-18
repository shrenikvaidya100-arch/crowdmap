-- User 2: after an admin restores an account, a new flag with the same counts
-- as an old one was skipped as a repeat. Only flags since the restore count now.
create or replace function public.bot_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u record;
  sig jsonb;
  s record;
  removed int := 0;
  flagged int := 0;
  checked int := 0;
  labels text;
begin
  -- Only accounts that did something recently need checking.
  for u in
    select p.id, p.trust_score from public.profiles p
    where p.status = 'active' and p.role <> 'admin' and not p.is_sample
      and exists (select 1 from public.audit_log a where a.actor_id = p.id and a.at > now() - interval '24 hours')
  loop
    checked := checked + 1;
    sig := public.bot_signals(u.id, now() - interval '7 days');
    select * into s from public.bot_score(sig);
    continue when s.score < 40;
    -- Don't repeat the same flag every 10 minutes: only when the evidence changed.
    -- Since an admin's restore, though, everything counts as new.
    continue when exists (select 1 from public.bot_flags f where f.user_id = u.id
                          and f.signals = s.fired and f.created_at > now() - interval '24 hours'
                          and f.created_at > coalesce((select max(a.at) from public.audit_log a
                                                       where a.action = 'admin.user_restore' and a.target_id = u.id::text),
                                                      '-infinity'));

    select string_agg(r.label || ' (' || (s.fired ->> r.signal) || ')', '; ' order by r.points desc)
      into labels from public.bot_rules r where s.fired ? r.signal;

    if s.score >= 100 then
      update public.profiles
         set status = 'removed', removed_at = now(),
             removed_reason = left('Automatic: ' || labels, 300)
       where id = u.id;
      insert into public.bot_flags (user_id, score, signals, outcome) values (u.id, s.score, s.fired, 'removed');
      perform public.log_event_as(null, 'system', 'system.bot_removed', 'profile', u.id::text,
        jsonb_build_object('score', s.score, 'signals', s.fired, 'reason', labels));
      removed := removed + 1;
    else
      update public.profiles set trust_score = least(trust_score, 0.2) where id = u.id;
      insert into public.bot_flags (user_id, score, signals, outcome) values (u.id, s.score, s.fired, 'flagged');
      perform public.log_event_as(null, 'system', 'system.bot_flagged', 'profile', u.id::text,
        jsonb_build_object('score', s.score, 'signals', s.fired, 'reason', labels));
      flagged := flagged + 1;
    end if;
  end loop;
  return jsonb_build_object('checked', checked, 'removed', removed, 'flagged', flagged);
end $$;
