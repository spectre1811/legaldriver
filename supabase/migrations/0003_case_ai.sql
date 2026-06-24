-- AI case summary (summary + next steps + generated_at), regenerated on demand.
alter table matter add column if not exists ai_summary jsonb;
