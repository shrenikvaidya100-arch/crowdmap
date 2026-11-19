-- Photos, videos and voice notes: the "you must be at the place" check can be
-- switched off for a while and back on later, without a deploy:
--   update public.app_settings set value = 'true' where key = 'media_require_location';
-- or the switch on the admin overview. It starts OFF (the owner asked to lift it
-- for now). Crowd reports and alerts still always need GPS.

insert into public.app_settings (key, value) values ('media_require_location', 'false')
on conflict (key) do update set value = excluded.value;

create or replace function public.media_location_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = 'media_require_location'), 'true') <> 'false';
$$;
grant execute on function public.media_location_required() to anon, authenticated;

-- Admins turn it back on (or off); the change is written to the audit log.
create or replace function public.admin_set_media_location(p_required boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_admin();
begin
  insert into public.app_settings (key, value) values ('media_require_location', case when p_required then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  perform public.log_event_as(uid, 'admin', 'admin.setting', 'setting', 'media_require_location',
    jsonb_build_object('required', p_required));
  return jsonb_build_object('ok', true, 'required', p_required);
end $$;
revoke all on function public.admin_set_media_location(boolean) from public, anon;
grant execute on function public.admin_set_media_location(boolean) to authenticated;

create or replace function public.begin_media_upload(
  p_place uuid, p_kind text, p_mime text, p_size int, p_duration real, p_caption text,
  p_lat double precision, p_lng double precision, p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  problem text;
  ext text;
  new_id uuid := gen_random_uuid();
  path text;
  cap text := nullif(trim(coalesce(p_caption, '')), '');
begin
  if p_kind not in ('photo', 'video', 'audio') then raise exception 'unknown media kind'; end if;
  ext := case
    when p_kind = 'photo' and p_mime = 'image/jpeg' then 'jpg'
    when p_kind = 'photo' and p_mime = 'image/webp' then 'webp'
    when p_kind = 'video' and p_mime = 'video/webm' then 'webm'
    when p_kind = 'video' and p_mime = 'video/mp4' then 'mp4'
    when p_kind = 'audio' and p_mime = 'audio/webm' then 'webm'
    when p_kind = 'audio' and p_mime = 'audio/mp4' then 'm4a'
    when p_kind = 'audio' and p_mime = 'audio/ogg' then 'ogg' end;
  if ext is null then return jsonb_build_object('ok', false, 'reason', 'bad_type'); end if;
  if p_size is null or p_size < 1 or p_size > 26214400 then
    return jsonb_build_object('ok', false, 'reason', 'too_large');
  end if;
  if p_kind in ('video', 'audio') and (p_duration is null or p_duration > 31) then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;
  if cap is not null and (char_length(cap) > 280 or public.is_junk_text(cap)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_caption');
  end if;
  if (select count(*) from public.media where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    perform public.log_event_as(uid, 'user', 'media.upload_rejected', 'place', p_place::text,
      jsonb_build_object('reason', 'rate_limited', 'kind', p_kind));
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- The location check can be switched off for a while (app_settings
  -- media_require_location = 'false'). With it off, a location is still checked
  -- when one is sent; without one the upload goes through.
  if public.media_location_required() or p_lat is not null then
    if p_lat is null or p_lng is null or p_accuracy is null then
      problem := 'location_required';
    else
      problem := public.media_location_problem(uid, p_place, p_lat, p_lng, p_accuracy, p_spread);
      if problem is not null and not public.media_location_required() then problem := null; end if;
    end if;
  end if;
  if problem is not null then
    perform public.log_event_as(uid, 'user', 'media.upload_rejected', 'place', p_place::text,
      jsonb_build_object('reason', problem, 'kind', p_kind, 'accuracy_m', p_accuracy));
    return jsonb_build_object('ok', false, 'reason', problem);
  end if;

  path := uid::text || '/' || new_id::text || '.' || ext;
  insert into public.media (id, place_id, user_id, kind, mime, size_bytes, duration_s, caption, storage_path)
  values (new_id, p_place, uid, p_kind, p_mime, p_size, case when p_kind = 'photo' then null else p_duration end, cap, path);
  return jsonb_build_object('ok', true, 'id', new_id, 'path', path);
end $$;
