-- 0029_profile_locale.sql
-- WO-03: persist a user's UI language preference on their profile so locale
-- survives across devices/sessions. Today locale is cookie-only (NEXT_LOCALE);
-- this makes the profile the source of truth, synced to the cookie at login.
--
-- FOUNDER-GATED (schema migration). NOT applied yet — awaiting approval.
--
-- Nullable: NULL means "no stored preference" → fall back to cookie /
-- Accept-Language / default 'en' (see src/lib/locale.ts, src/i18n/config.ts).
alter table profile add column if not exists locale text;

-- Restrict to supported/reserved locales (keep in sync with src/i18n/config.ts:
-- 'en', 'hi' at launch; 'gu' reserved for the Gujarati fast-follow).
alter table profile drop constraint if exists profile_locale_check;
alter table profile
  add constraint profile_locale_check
  check (locale is null or locale in ('en', 'hi', 'gu'));

-- RLS: profile already has row-level security (0001_init.sql). The existing
-- profile_update policy (id = auth.uid()) already lets a user update ONLY their
-- own row, so setting one's own locale is covered — NO new policy required, and
-- this adds no new cross-tenant surface (locale is a per-user UI preference).
comment on column profile.locale is 'Preferred UI locale (en|hi|gu); NULL = fall back to cookie/Accept-Language/en. WO-03.';
