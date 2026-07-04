-- WO-29 W3 · tag email-sourced documents with their email's subject so they're findable by it
-- (e.g. searching "retainer" surfaces the PDF that arrived in a "Retainer agreement" email).
-- Additive nullable text; only gmail-sourced docs set it. Seam for future AI document tags.
alter table document add column if not exists email_subject text;
