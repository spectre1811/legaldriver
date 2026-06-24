-- Supabase Vault wrappers so the server (service_role) can store/read the Gmail
-- OAuth refresh token encrypted at rest. oauth_connection.refresh_token_ref holds
-- the returned secret id — never the token itself. SECURITY DEFINER so the
-- function (owned by postgres) can reach the vault schema; EXECUTE granted to
-- service_role only (revoked from anon/authenticated).

create extension if not exists supabase_vault with schema vault;

create or replace function public.store_secret(secret text, secret_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare new_id uuid;
begin
  select vault.create_secret(secret, secret_name) into new_id;
  return new_id;
end $$;

create or replace function public.read_secret(secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where id = secret_id;
$$;

revoke all on function public.store_secret(text, text) from public, anon, authenticated;
revoke all on function public.read_secret(uuid) from public, anon, authenticated;
grant execute on function public.store_secret(text, text) to service_role;
grant execute on function public.read_secret(uuid) to service_role;
