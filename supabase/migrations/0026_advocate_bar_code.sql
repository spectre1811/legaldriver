-- LegalDriver integration: eCourts numeric bar CODE (e.g. 1946) — distinct from the
-- full bar_registration_number ("GUJ/1234/2020"). Used for exact advocate lookup
-- against the LegalDriver API (/advocate/{bar_id}); name-resolution is the fallback.
alter table advocate add column if not exists bar_code text;
