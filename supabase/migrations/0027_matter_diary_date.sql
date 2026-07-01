-- Trust layer: the advocate's own "diary" next-hearing date, which OVERRIDES the
-- synced court date when the eCourts record is stale/wrong (the #1 market complaint).
-- The synced next_hearing_date stays as-is (court source of truth); the effective
-- date shown to the advocate + used for reminders = override ?? synced.
alter table matter add column if not exists next_hearing_override date;
