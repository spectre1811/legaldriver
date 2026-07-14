-- WO-156 · Fix court_order dedup — key on the STABLE provider order id, not (date, title).
--
-- The old unique index `court_order_dedup_idx` on
--   (matter_id, coalesce(order_date,'1900-01-01'::date), coalesce(title,''))
-- collapsed DISTINCT orders that happen to be dateless with a generic "Order" title to a single
-- key. `upsertCase` re-inserts a matter's orders in ONE multi-row INSERT, so a case with >=2 such
-- orders violated the unique index → Postgres rejected the WHOLE batch atomically → 0 orders
-- persisted (silently, the error was swallowed). Live-confirmed on CNR GJHC240458482025: 9 orders
-- upstream, 0 in the DB, 3 of them dateless+generic.
--
-- Orders are identified by their stable provider order id (`raw->>'order_id'`, always set on the
-- sync path). Dedupe on THAT — distinct orders stay distinct; re-sync stays idempotent (upsertCase
-- deletes the matter's orders before re-inserting, so cross-sync idempotency never relied on this
-- index anyway — it only guards against dupes WITHIN one insert, where order_id is unique).

-- 1) Remove any pre-existing (matter_id, order_id) duplicates so the new unique index builds clean.
--    ctid tie-break keeps exactly one row per (matter_id, order_id) group.
delete from court_order a
  using court_order b
  where a.ctid < b.ctid
    and a.matter_id = b.matter_id
    and a.raw ->> 'order_id' is not null
    and a.raw ->> 'order_id' = b.raw ->> 'order_id';

-- 2) Swap the dedup key: drop the (date,title) unique index, add a (matter_id, order_id) one.
--    Partial (order_id NOT NULL) so legacy/manual rows without a provider id are never blocked.
drop index if exists court_order_dedup_idx;

create unique index if not exists court_order_order_id_idx
  on court_order (matter_id, (raw ->> 'order_id'))
  where raw ->> 'order_id' is not null;
