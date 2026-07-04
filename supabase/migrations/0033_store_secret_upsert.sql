-- WO-29 · fix "Could not store credential" on Gmail (re)connect. store_secret used
-- vault.create_secret, which rejects a DUPLICATE name — but the secret name is a stable
-- gmail:{tenant}:{user}, so reconnecting (after a disconnect that left the old secret behind)
-- collided and the OAuth callback failed. Make it upsert: update the existing secret in place,
-- else create. Applied to prod on 2026-07-05 to unblock Gmail connect.
create or replace function public.store_secret(secret text, secret_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare existing_id uuid; new_id uuid;
begin
  select id into existing_id from vault.secrets where name = secret_name;
  if existing_id is not null then
    perform vault.update_secret(existing_id, secret, secret_name);
    return existing_id;
  end if;
  select vault.create_secret(secret, secret_name) into new_id;
  return new_id;
end $fn$;

revoke all on function public.store_secret(text, text) from public, anon, authenticated;
grant execute on function public.store_secret(text, text) to service_role;
