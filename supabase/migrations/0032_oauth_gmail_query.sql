-- WO-29 W1b · optional per-connection Gmail scope. A nullable free-text Gmail search query the
-- advocate can set to narrow ingestion (e.g. "from:(@courts.gov.in) OR label:legal"); empty/NULL =
-- ingest all (minus the always-on spam/promotions hygiene). Additive, nullable — no backfill.
alter table oauth_connection add column if not exists gmail_query text;
