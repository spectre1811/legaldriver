-- Drafting agent · P-B — the drafting-convention knowledge base ("bake a skill" as
-- data). Same model as deadline_rule / legal_reference (0015): tenant-scoped seed,
-- RLS, seeded for existing + new tenants, editable, cited. The LLM later fills this
-- structured skeleton (headings + required points + section hooks) instead of
-- improvising prose — so drafts are consistent, reviewable, and gap-aware.
-- Assistive only; verify against the bare act. See docs/decisions/2026-06-29-drafting-agent.md.

create table if not exists draft_template (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenant(id) on delete cascade,
  responds_to_category  text not null,                 -- categoryOf() key of the SOURCE doc (e.g. 'notices')
  responds_to_doc_type  text,                          -- finer trigger (e.g. 'demand_notice','summons') — nullable
  produces_doc_type     text not null,                 -- the DRAFT's doc_type (e.g. 'reply_notice')
  title                 text not null,
  jurisdiction          text,                          -- "NI Act s.138/139", "CPC Order VIII", "BNSS"
  default_sections      text[] not null default '{}',  -- statutory hooks to draft under (user-overridable)
  structure             jsonb not null default '[]',   -- ordered: [{heading, guidance, required_points[]}]
  conventions           text,                          -- Indian drafting norms (cause-title, verification, prayer)
  language              text not null default 'en',     -- 'en' | 'hi' | 'gu' | 'bilingual'
  source                text,                          -- provenance for the convention
  is_default            boolean not null default true,
  created_at            timestamptz not null default now()
);
create index if not exists draft_template_tenant_idx on draft_template (tenant_id);
create index if not exists draft_template_trigger_idx on draft_template (tenant_id, responds_to_category);

-- ── RLS (the standard 4 policies, keyed to current_tenant_id()) ───────────────
do $$
declare t text;
begin
  foreach t in array array['draft_template'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;

-- ── Reusable seed pack (called for existing tenants below + from handle_new_user) ──
create or replace function seed_draft_templates(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public as $func$
begin
  insert into draft_template
    (tenant_id, responds_to_category, responds_to_doc_type, produces_doc_type, title, jurisdiction, default_sections, structure, conventions, language, source)
  select p_tenant, r.responds_to_category, r.responds_to_doc_type, r.produces_doc_type, r.title, r.jurisdiction, r.default_sections, r.structure::jsonb, r.conventions, 'en', r.source
  from (values
    (
      'notices', 'demand_notice', 'reply_notice',
      'Reply to a Section 138 NI Act demand notice',
      'NI Act s.138/139', array['NI Act s.139','NI Act s.138'],
      $j$[
        {"heading":"Cause-title & addressee","guidance":"Address the sender or their advocate; quote the notice date and reference. Mark the reply 'without prejudice'.","required_points":["Date and reference of the notice replied to","Name and address of the noticee/client","Without-prejudice superscription"]},
        {"heading":"Preliminary objections","guidance":"Maintainability, limitation, authority and vague averments.","required_points":["Whether the s.138 statutory timeline (30/15/30 days) was followed","Locus and authority of the sender to issue the notice"]},
        {"heading":"Para-wise reply","guidance":"Admit or deny each paragraph specifically; avoid evasive or general denials.","required_points":["Specific admission or denial of each allegation","No evasive denials"]},
        {"heading":"Factual narrative","guidance":"The client's version of the underlying transaction and the cheque.","required_points":["Nature of the underlying transaction/debt","Circumstances in which the cheque was issued","Whether a legally enforceable debt or liability exists"]},
        {"heading":"Rebuttal of the s.139 presumption","guidance":"Set up the defence to the presumption of consideration.","required_points":["Facts rebutting the presumption under s.139","Documents or evidence relied upon"]},
        {"heading":"Reservation & prayer","guidance":"Reserve rights; demand withdrawal/particulars; note costs.","required_points":["Demand for withdrawal of the notice","Reservation of the right to initiate legal action","Costs of the reply"]}
      ]$j$,
      'Indian notice-reply conventions: para-wise reply mirroring the notice, without-prejudice, specific (not evasive) denials, signed by/through advocate, reservation of rights.',
      'NI Act 1881'
    ),
    (
      'notices', 'legal_notice', 'reply_notice',
      'Reply to a legal/demand notice (general civil)',
      'Civil — general', array['Limitation Act 1963'],
      $j$[
        {"heading":"Cause-title & addressee","guidance":"Address the sender/their advocate; quote the notice date and subject.","required_points":["Date and subject of the notice","Parties and their addresses","Without-prejudice superscription"]},
        {"heading":"Preliminary objections","guidance":"Maintainability, limitation, jurisdiction, authority.","required_points":["Limitation/laches","Authority and locus of the sender"]},
        {"heading":"Para-wise reply","guidance":"Specifically admit or deny each averment.","required_points":["Specific reply to each paragraph","Denial of incorrect/unsupported allegations"]},
        {"heading":"Client's case","guidance":"Set out the client's version and supporting facts.","required_points":["Client's factual narrative","Documents relied upon"]},
        {"heading":"Reservation & prayer","guidance":"Reserve rights; demand withdrawal; costs.","required_points":["Demand for withdrawal/compliance","Reservation of rights","Costs"]}
      ]$j$,
      'Para-wise reply, without-prejudice, specific denials, limitation flagged, signed through advocate.',
      'Civil practice'
    ),
    (
      'notices', 'summons', 'written_statement',
      'Written Statement (CPC Order VIII)',
      'CPC Order VIII', array['CPC Order VIII r.1'],
      $j$[
        {"heading":"Cause-title","guidance":"Court, suit number, parties as arrayed in the plaint.","required_points":["Correct court and suit number","Parties as in the plaint"]},
        {"heading":"Preliminary objections","guidance":"Maintainability, limitation, jurisdiction, non-joinder/mis-joinder, cause of action.","required_points":["Limitation","Jurisdiction","Cause of action / maintainability"]},
        {"heading":"Para-wise reply","guidance":"Order VIII r.3-5: admit, deny, or state not admitted for each paragraph; a fact not specifically denied is deemed admitted.","required_points":["Specific admission/denial of every plaint paragraph","No evasive denials (deemed admission risk)"]},
        {"heading":"Additional pleas","guidance":"The defendant's affirmative case and set-off/counter-claim if any.","required_points":["Defendant's version of facts","Set-off or counter-claim if applicable"]},
        {"heading":"Prayer","guidance":"Dismissal with costs.","required_points":["Prayer to dismiss the suit with costs"]},
        {"heading":"Verification & affidavit","guidance":"Verification clause + statement of truth/affidavit per CPC.","required_points":["Verification clause","Affidavit in support / statement of truth"]}
      ]$j$,
      'CPC Order VIII: para-wise reply (silence = admission), preliminary objections, additional pleas, verification + affidavit; file within 30 days (extendable to 90; 120 hard cap for commercial suits).',
      'Code of Civil Procedure 1908'
    ),
    (
      'notices', 'summons', 'application',
      'Anticipatory / regular bail application (BNSS)',
      'BNSS s.482 / s.480', array['BNSS s.482','BNSS s.480'],
      $j$[
        {"heading":"Cause-title","guidance":"Court (Sessions/High Court), FIR/case number, police station, sections invoked.","required_points":["Court and case/FIR number","Police station and date of FIR","Offences/sections alleged"]},
        {"heading":"Brief facts","guidance":"Concise, neutral summary of the prosecution case and the applicant's role.","required_points":["Prosecution allegations in brief","Applicant's stated role/innocence"]},
        {"heading":"Grounds for bail","guidance":"Parity, no custodial interrogation needed, false implication, triable issues, period in custody, health, etc.","required_points":["Specific grounds (parity/false implication/no recovery pending)","Why custody is not warranted"]},
        {"heading":"Undertakings & conditions","guidance":"Cooperation, no tampering, surrender of passport, appearance.","required_points":["Undertaking to cooperate and not tamper with evidence","Willingness to abide by conditions"]},
        {"heading":"Prayer","guidance":"Grant of anticipatory bail (s.482) or regular bail (s.480) on conditions.","required_points":["Specific prayer for anticipatory/regular bail","Interim protection if applicable"]}
      ]$j$,
      'BNSS bail practice: anticipatory bail under s.482 (was CrPC 438), regular bail under s.480 (was CrPC 437/439); state grounds with specificity; undertakings; verify the exact offence slab.',
      'BNSS 2023'
    ),
    (
      'orders_judgments', 'order', 'application',
      'Application in compliance with / reply to a court order',
      'CPC / BNSS — as applicable', array[]::text[],
      $j$[
        {"heading":"Cause-title","guidance":"Court, case number, parties; reference the order being responded to.","required_points":["Court and case number","Date of the order being complied with/replied to"]},
        {"heading":"The order & what it directs","guidance":"Summarise the operative direction and the compliance required.","required_points":["Operative portion of the order","What the court directed the party to do"]},
        {"heading":"Compliance / response","guidance":"How the client complies, or the reason for the application.","required_points":["Steps taken in compliance","Documents filed/annexed","Any inability and the reason"]},
        {"heading":"Prayer","guidance":"What the application seeks (extension, modification, acceptance of compliance).","required_points":["Specific relief sought"]},
        {"heading":"Verification","guidance":"Verification/affidavit as required.","required_points":["Verification clause / supporting affidavit"]}
      ]$j$,
      'Track the operative direction precisely; annex proof of compliance; verify deadlines; affidavit/verification as the forum requires.',
      'Civil/criminal practice'
    ),
    (
      'pleadings', 'petition', 'affidavit',
      'Counter-affidavit / reply to a petition',
      'Constitutional / civil', array[]::text[],
      $j$[
        {"heading":"Cause-title","guidance":"Court, writ/petition number, parties; deponent details.","required_points":["Court and petition number","Deponent's name, age, capacity"]},
        {"heading":"Preliminary submissions","guidance":"Maintainability, alternative remedy, delay/laches, locus.","required_points":["Maintainability/alternative remedy","Delay and laches"]},
        {"heading":"Para-wise reply","guidance":"Specifically reply to each paragraph of the petition.","required_points":["Specific admission/denial of each petition paragraph"]},
        {"heading":"Respondent's case","guidance":"The respondent's affirmative stand and supporting record.","required_points":["Respondent's version","Record/annexures relied upon"]},
        {"heading":"Prayer & verification","guidance":"Dismissal with costs; verification + affidavit.","required_points":["Prayer to dismiss","Verification and affidavit clause"]}
      ]$j$,
      'Counter-affidavit norms: deponent clause, preliminary submissions, para-wise reply, affirmative case, verification + attestation.',
      'Constitutional/civil practice'
    ),
    (
      'other', null, 'vakalatnama',
      'Vakalatnama (authority to appear)',
      'General', array[]::text[],
      $j$[
        {"heading":"Court & parties","guidance":"Court, case number (if any), and the party engaging the advocate.","required_points":["Court/forum","Case number if assigned","Name and address of the client"]},
        {"heading":"Authority granted","guidance":"Standard authority to appear, act, plead, compromise (as instructed), receive documents.","required_points":["Scope of authority","Any limits on authority (e.g. no compromise without instructions)"]},
        {"heading":"Advocate & acceptance","guidance":"Advocate's name, enrolment number; acceptance and signatures.","required_points":["Advocate name and enrolment number","Client signature and acceptance"]}
      ]$j$,
      'Largely boilerplate fill: court, parties, advocate enrolment, authority clause, signatures/acceptance; stamp as per local rules.',
      'Bar practice'
    )
  ) as r(responds_to_category, responds_to_doc_type, produces_doc_type, title, jurisdiction, default_sections, structure, conventions, source)
  where not exists (
    select 1 from draft_template d
    where d.tenant_id = p_tenant and d.produces_doc_type = r.produces_doc_type
      and d.responds_to_category = r.responds_to_category
      and coalesce(d.responds_to_doc_type,'') = coalesce(r.responds_to_doc_type,'')
  );
end $func$;

-- Seed every existing tenant.
select seed_draft_templates(t.id) from tenant t;

-- ── Seed new tenants too: re-define handle_new_user() with the seed call added ──
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
  perform seed_draft_templates(new_tenant_id);
  return new;
end $function$;
