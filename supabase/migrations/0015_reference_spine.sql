-- Phase 3 · 0015 — court-data "reference spine" (keyless, curated, verifiable).
-- The free bulk corpora we researched are not cleanly ingestable from here today
-- (India Code has no REST API → HTML-only; e-SCR unreachable; DevDataLab is a large
-- historical bulk download) — those are backlogged. What we CAN build with high
-- confidence is the structured legal knowledge that actually powers features:
--   (a) deadline_rule — Indian limitation/procedural deadlines, so the deadline engine
--       can compute jurisdiction-aware due dates (was empty → feature never fired).
--   (b) legal_reference — expand the maintained law pack the Lawyer Agent grounds on.
-- Both are tenant-scoped seeds (RLS), seeded for existing tenants + new ones.
-- Assistive only; verify against the bare act.

-- ── (a) deadline_rule defaults ───────────────────────────────────────────────
insert into deadline_rule (tenant_id, jurisdiction, trigger, kind, days, description)
select t.id, r.jurisdiction, r.trigger, r.kind, r.days, r.description
from tenant t
cross join (values
  ('NI Act s.138',        'cheque_returned',        'demand_notice',     30,   'Send the statutory demand notice within 30 days of the bank''s cheque-return memo.'),
  ('NI Act s.138',        'demand_notice_served',   'payment_window',    15,   'Drawer has 15 days from receipt of the demand notice to pay.'),
  ('NI Act s.138',        'payment_window_expired', 'file_complaint',    30,   'File the complaint within 30 days after the 15-day payment window expires.'),
  ('CPC Order VIII r.1',  'summons_served',         'written_statement', 30,   'File the written statement within 30 days of service of summons (court may extend to 90).'),
  ('CPC (Commercial)',    'summons_served',         'written_statement', 120,  'Commercial suits: written statement within 120 days of service (hard cap).'),
  ('Limitation Act 1963', 'cause_of_action',        'money_suit',        1095, 'Suit for recovery of money: 3 years from when the cause of action accrues (Art. 1/Sch.).'),
  ('Limitation Act 1963', 'decree_passed',          'first_appeal_hc',   90,   'First appeal to the High Court from a decree: 90 days.'),
  ('Limitation Act 1963', 'decree_passed',          'first_appeal_sub',  30,   'First appeal to a subordinate court from a decree: 30 days.'),
  ('Limitation Act 1963', 'order_passed',           'review',            30,   'Review application: 30 days from the date of the order/decree.'),
  ('Limitation Act 1963', 'order_passed',           'revision',          90,   'Civil revision to the High Court: 90 days (verify the specific article).'),
  ('Limitation Act 1963', 'decree_passed',          'execution',         4383, 'Execution of a decree: 12 years from when the decree becomes enforceable.'),
  ('Arbitration Act s.34','award_received',         'set_aside_award',   90,   'Application to set aside an arbitral award: within 3 months of receipt (further 30 days condonable).'),
  ('Consumer Act 2019',   'cause_of_action',        'consumer_complaint',730,  'Consumer complaint: within 2 years of the cause of action.'),
  ('BNSS s.187',          'arrest',                 'default_bail',      60,   'Default bail accrues if charge-sheet not filed in 60/90 days (offence-dependent) — verify the slab.')
) as r(jurisdiction, trigger, kind, days, description)
where not exists (
  select 1 from deadline_rule d where d.tenant_id = t.id and d.jurisdiction = r.jurisdiction and d.kind = r.kind
);

-- Seed the same rules for newly-bootstrapped tenants.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public as $function$
declare new_tenant_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'is_portal','') = 'true' then
    return new;
  end if;
  insert into tenant (name)
    values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace')
    returning id into new_tenant_id;
  insert into profile (id, tenant_id, full_name, role)
    values (new.id, new_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');
  insert into practice_area (tenant_id, name)
    select new_tenant_id, name from (values
      ('Civil Litigation'), ('Criminal'), ('Family & Matrimonial'),
      ('Property & Real Estate'), ('Corporate & Commercial'), ('Cheque Bounce (NI Act 138)'),
      ('Arbitration'), ('Consumer'), ('Labour & Employment'),
      ('Intellectual Property'), ('Taxation'), ('Writ & Constitutional')
    ) as pa(name);
  insert into deadline_rule (tenant_id, jurisdiction, trigger, kind, days, description)
    select new_tenant_id, jurisdiction, trigger, kind, days, description from (values
      ('NI Act s.138','cheque_returned','demand_notice',30,'Send the statutory demand notice within 30 days of the bank''s cheque-return memo.'),
      ('NI Act s.138','demand_notice_served','payment_window',15,'Drawer has 15 days from receipt of the demand notice to pay.'),
      ('NI Act s.138','payment_window_expired','file_complaint',30,'File the complaint within 30 days after the 15-day payment window expires.'),
      ('CPC Order VIII r.1','summons_served','written_statement',30,'File the written statement within 30 days of service of summons (court may extend to 90).'),
      ('Limitation Act 1963','cause_of_action','money_suit',1095,'Suit for recovery of money: 3 years from when the cause of action accrues.'),
      ('Limitation Act 1963','decree_passed','first_appeal_hc',90,'First appeal to the High Court from a decree: 90 days.'),
      ('Limitation Act 1963','order_passed','review',30,'Review application: 30 days from the date of the order/decree.'),
      ('Limitation Act 1963','decree_passed','execution',4383,'Execution of a decree: 12 years.'),
      ('Arbitration Act s.34','award_received','set_aside_award',90,'Set aside an arbitral award: within 3 months of receipt.'),
      ('Consumer Act 2019','cause_of_action','consumer_complaint',730,'Consumer complaint: within 2 years of the cause of action.')
    ) as r(jurisdiction, trigger, kind, days, description);
  return new;
end $function$;

-- ── (b) legal_reference expansion ────────────────────────────────────────────
insert into legal_reference (kind, topic, old_ref, new_ref, title, summary, source, tags) values
('section_map','Dowry death','IPC 304B','BNS 80','Dowry death','IPC s.304B maps to BNS s.80.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Grievous hurt by dangerous weapon','IPC 326','BNS 118','Voluntarily causing grievous hurt by dangerous weapons','IPC s.326 maps to BNS s.118.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Criminal intimidation','IPC 506','BNS 351','Criminal intimidation','IPC s.506 maps to BNS s.351.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Criminal breach of trust','IPC 406','BNS 316','Criminal breach of trust','IPC s.406 maps to BNS s.316.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Kidnapping','IPC 363','BNS 137','Kidnapping','IPC s.363 maps to BNS s.137.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Anticipatory bail','CrPC 438','BNSS 482','Direction for grant of bail to a person apprehending arrest','CrPC s.438 (anticipatory bail) maps to BNSS s.482.','BNSS 2023', array['procedure','bnss','crpc','bail']),
('section_map','Examination of complainant','CrPC 200','BNSS 223','Examination of the complainant','CrPC s.200 maps to BNSS s.223.','BNSS 2023', array['procedure','bnss','crpc']),
('section_map','Power to summon material witness','CrPC 311','BNSS 348','Power to summon/recall a material witness','CrPC s.311 maps to BNSS s.348.','BNSS 2023', array['procedure','bnss','crpc']),
('section_map','Expert opinion','IEA 45','BSA 39','Opinions of experts','Indian Evidence Act s.45 maps to Bharatiya Sakshya Adhiniyam s.39.','BSA 2023', array['evidence','bsa','iea']),
('procedure','Quashing of FIR','CrPC 482','BNSS 528','Quashing an FIR / inherent powers','High Court''s inherent power (CrPC 482 → BNSS 528) is invoked to quash FIRs/proceedings; also writ jurisdiction under Art. 226.','BNSS 2023', array['procedure','quashing','bnss']),
('procedure','Anticipatory bail flow','CrPC 438',null,'Anticipatory bail — practical flow','Apply before Sessions/High Court under BNSS s.482; seek interim protection; conditions under s.482(2). Custodial-interrogation considerations apply.','BNSS 2023', array['bail','procedure']),
('limitation','Arbitration set-aside','Arbitration Act s.34',null,'Limitation — set aside award','3 months from receipt of the award; a further 30 days is condonable for sufficient cause, not beyond.','Arbitration & Conciliation Act 1996', array['limitation','arbitration']),
('limitation','Execution of decree',null,null,'Limitation — execution','Execution of a decree: 12 years (Art. 136, Limitation Act 1963).','Limitation Act 1963', array['limitation','civil','execution']),
('limitation','Consumer complaint',null,null,'Limitation — consumer','A consumer complaint must be filed within 2 years of the cause of action (Consumer Protection Act 2019).','Consumer Protection Act 2019', array['limitation','consumer'])
on conflict do nothing;
