-- Review round 2: housekeeping.
--
-- Hourly (pg_cron, inside the database): drop stale presence pings, GPS-check
-- records older than 90 days, and reviewed bot findings older than 90 days.
-- Daily (Vercel cron → /api/cron/daily, which also keeps the free database from
-- pausing): delete files of uploads that were never finished and files whose
-- upload record is gone. Files can only be deleted through the Storage API, so
-- the database lists them and the server removes them.

create function public.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  presence_n int;
  checks_n int;
  flags_n int;
begin
  delete from public.presence where updated_at < now() - interval '1 hour';
  get diagnostics presence_n = row_count;
  delete from public.location_checks where at < now() - interval '90 days';
  get diagnostics checks_n = row_count;
  delete from public.bot_flags where reviewed_at < now() - interval '90 days';
  get diagnostics flags_n = row_count;
  return jsonb_build_object('presence', presence_n, 'location_checks', checks_n, 'bot_flags', flags_n);
end $$;
revoke all on function public.maintenance() from public, anon, authenticated;
select cron.schedule('crowdmap-maintenance', '17 * * * *', 'select public.maintenance()');

/** Files to delete: unfinished uploads older than an hour, and files with no upload record. */
create function public.media_cleanup_candidates(p_limit int default 200)
returns table (path text, why text)
language sql stable security definer set search_path = '' as $$
  (select m.storage_path, 'unfinished' from public.media m
    where m.status = 'pending' and m.created_at < now() - interval '1 hour')
  union all
  (select o.name, 'orphan' from storage.objects o
    where o.bucket_id = 'media' and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.media m where m.storage_path = o.name))
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.media_cleanup_candidates(int) from public, anon, authenticated;
grant execute on function public.media_cleanup_candidates(int) to service_role;

/** After the files are gone: drop the unfinished upload rows and log the run. */
create function public.media_cleanup_done(p_paths text[], p_files_removed int) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.media where status = 'pending' and storage_path = any(p_paths)
    and created_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  perform public.log_event_as(null, 'system', 'system.media_cleanup', null, null,
    jsonb_build_object('files_removed', p_files_removed, 'unfinished_rows_removed', n));
  return n;
end $$;
revoke all on function public.media_cleanup_done(text[], int) from public, anon, authenticated;
grant execute on function public.media_cleanup_done(text[], int) to service_role;
