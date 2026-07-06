-- WO-54 W1 · Promote court tier to an indexed, NORMALIZED column on `matter`.
--
-- Why: the Cases tier tabs + tier-aware facets (Wave 2) must filter on a bounded, indexed value, not a
-- `detail` jsonb full-scan. `detail.tier` is stored VERBATIM from the platform (un-normalized — prod
-- shows "HIGH" for High Court), so a raw/generated column would fragment the tabs. This column holds a
-- normalized value written by the app's pure `normalizeTier()`; the backfill below mirrors that map
-- exactly (guardrail test `wo54_tier` locks them together).
--
-- Safety: ADDITIVE + nullable → no rewrite lock, no RLS change (RLS already scopes `matter` by tenant),
-- reversible (`drop column tier`). Backfill is idempotent (`where tier is null`) and reads only existing
-- jsonb (no eCourts re-fetch). Verified pre-apply: `matter` = 262 rows, no existing `tier` column,
-- tier values ∈ {HIGH:64, DISTRICT:40, null:158}.

alter table matter add column if not exists tier text;

-- Backfill from the existing jsonb — MUST mirror src/lib/court/tier.ts::normalizeTier().
update matter set tier = (
  case
    when detail->>'tier' is null or btrim(detail->>'tier') = '' then null
    when upper(btrim(detail->>'tier')) like '%TRIBUNAL%'
      or upper(btrim(detail->>'tier')) in ('CAT','NCLT','NGT','DRT')          then 'TRIBUNAL'
    when upper(btrim(detail->>'tier')) = 'SC'
      or upper(btrim(detail->>'tier')) like 'SUPREME%'                        then 'SC'
    when upper(btrim(detail->>'tier')) = 'HC'
      or upper(btrim(detail->>'tier')) like 'HIGH%'                           then 'HC'
    when upper(btrim(detail->>'tier')) = 'DIST'
      or upper(btrim(detail->>'tier')) like 'DISTRICT%'
      or upper(btrim(detail->>'tier')) like '%SESSION%'                       then 'DISTRICT'
    else null
  end
)
where detail is not null and tier is null;

-- Partial index for the per-tier faceted list (tenant-scoped; only the populated rows).
create index if not exists matter_tier_idx on matter (tenant_id, tier) where tier is not null;
