-- Server-only lookup used by login and sign-up: is this email registered, is it
-- confirmed, and which sign-in methods does it have (email, google)?
-- Only the service role can call it, so it can't be used to probe accounts.
create or replace function public.auth_account_for_email(p_email text)
returns table (id uuid, confirmed boolean, providers text[])
language sql stable security definer set search_path = '' as $$
  select u.id,
         u.email_confirmed_at is not null,
         coalesce(array(select distinct i.provider from auth.identities i where i.user_id = u.id), '{}')
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;
revoke all on function public.auth_account_for_email(text) from public, anon, authenticated;
grant execute on function public.auth_account_for_email(text) to service_role;
