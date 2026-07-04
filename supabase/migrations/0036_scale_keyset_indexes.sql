-- WO-39 W3 · Scale foundations — keyset/sort indexes (FOUNDER-GATED)
--
-- Backs the keyset pagination landed in WO-39 W1/W2 and the date-window scans the
-- audit flagged. A keyset page (`ORDER BY (sort_col, id)` + `WHERE (sort_col,id)` past
-- the cursor) is only fast with a matching composite index; without it every page does
-- a full scan + sort as a tenant's data grows. All additive + idempotent + non-locking
-- at current table sizes — no existing screen changes.
--
-- Already present (verified against prior migrations — NOT re-added here):
--   msg_message  (tenant_id, created_at desc)      -- 0-messages migration
--   voice_recording (tenant_id, created_at desc)   -- voice migration
--   document (tenant_id, category) / (tenant_id, content_hash) / fts / matter / client
--
-- NOTE (numbering): the sequence is contended (duplicate 0031, gap at 0032). These are
-- order-independent `if not exists` indexes, so the exact number is cosmetic. Numbered
-- 0036 to clear WO-29's in-flight 0034/0035; a gap is harmless.
-- NOTE (scale): at large table sizes prefer `CREATE INDEX CONCURRENTLY` (cannot run in a
-- txn block) to avoid a write lock; plain form is fine at today's row counts.

-- Lists paginated in W1/W2 -------------------------------------------------------------
-- notices: keyset by created_at DESC + id tiebreaker (WO-39 W1).
create index if not exists notice_tenant_created_idx
  on notice (tenant_id, created_at desc, id);

-- clients: keyset by name ASC + id tiebreaker (WO-39 W1 — the clients directory).
create index if not exists client_tenant_name_idx
  on client (tenant_id, name, id);

-- Lists queued for the W2 sweep --------------------------------------------------------
-- ip: renewal-date urgency order (nullable → nulls sort last in a btree ASC index).
create index if not exists ip_asset_tenant_renewal_idx
  on ip_asset (tenant_id, renewal_date, id);

-- documents: created_at DESC keyset (the silent limit(300) surface).
create index if not exists document_tenant_created_idx
  on document (tenant_id, created_at desc, id);

-- cause-list board: date + item ordering within a court/day.
create index if not exists cause_list_tenant_date_idx
  on cause_list_entry (tenant_id, list_date, item_no, id);

-- Matter next-hearing sort (cases list + calendar upcoming) ----------------------------
create index if not exists matter_tenant_nexthearing_idx
  on matter (tenant_id, next_hearing_date, id);

-- Calendar date-window scans (audit: 5 range scans, unindexed date columns) ------------
create index if not exists hearing_tenant_date_idx
  on hearing (tenant_id, date);
create index if not exists deadline_tenant_due_idx
  on deadline (tenant_id, due_date);
create index if not exists calendar_event_tenant_date_idx
  on calendar_event (tenant_id, event_date);
