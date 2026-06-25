-- Phase 3 · 0011 — service scaffolding (modular monolith, contract-first)
--   E1 Messaging Gateway  : msg_message
--   E5 Voice/Call Service : voice_recording
--   E6 AI / Lawyer Agent  : agent_thread, agent_turn, legal_reference (KB, seeded), document_chunk
-- Tenant-owned tables get the standard 4 RLS policies. legal_reference is shared,
-- non-PII reference data: world-readable, service-role write only.

-- ── E1 · Messaging ───────────────────────────────────────────────────────────
create table if not exists msg_message (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  channel     text not null check (channel in ('whatsapp','email','sms')),
  direction   text not null check (direction in ('in','out')),
  provider    text,
  external_id text,                       -- provider message id (idempotency)
  thread_key  text,                       -- conversation key (contact number/email)
  from_addr   text,
  to_addr     text,
  client_id   uuid references client (id) on delete set null,
  matter_id   uuid references matter (id) on delete set null,
  body        text,
  media       jsonb not null default '[]',
  status      text not null default 'received' check (status in ('received','sent','failed','queued')),
  classified  jsonb,
  confidence  real,
  created_at  timestamptz not null default now()
);
create index if not exists msg_message_tenant_idx on msg_message (tenant_id, created_at desc);
create index if not exists msg_message_thread_idx on msg_message (tenant_id, thread_key);
create unique index if not exists msg_message_external_uq on msg_message (tenant_id, channel, external_id) where external_id is not null;

-- ── E5 · Voice / Call ────────────────────────────────────────────────────────
create table if not exists voice_recording (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant (id) on delete cascade,
  source            text not null check (source in ('upload','telephony','native')),
  provider          text,
  external_id       text,
  from_number       text,
  to_number         text,
  client_id         uuid references client (id) on delete set null,
  matter_id         uuid references matter (id) on delete set null,
  storage_path      text,
  duration_sec      int,
  consent_disclosed boolean not null default false,
  language          text,
  transcript        text,                 -- PII: treat as sensitive
  summary           jsonb,
  status            text not null default 'uploaded' check (status in ('uploaded','transcribing','transcribed','summarized','failed')),
  created_at        timestamptz not null default now()
);
create index if not exists voice_recording_tenant_idx on voice_recording (tenant_id, created_at desc);
create index if not exists voice_recording_client_idx on voice_recording (client_id);
create index if not exists voice_recording_number_idx on voice_recording (tenant_id, from_number);

-- ── E6 · Lawyer Agent ────────────────────────────────────────────────────────
create table if not exists agent_thread (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  matter_id  uuid references matter (id) on delete set null,
  client_id  uuid references client (id) on delete set null,
  title      text,
  created_at timestamptz not null default now()
);
create index if not exists agent_thread_tenant_idx on agent_thread (tenant_id, created_at desc);

create table if not exists agent_turn (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references agent_thread (id) on delete cascade,
  tenant_id  uuid not null references tenant (id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  citations  jsonb not null default '[]',  -- [{source, ref, title, snippet}]
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_turn_thread_idx on agent_turn (thread_id, created_at);

-- Maintained legal knowledge pack (old↔new law, procedures, limitation). Shared,
-- non-PII; the agent grounds answers in it and cites it.
create table if not exists legal_reference (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('section_map','procedure','limitation','note')),
  topic      text,
  old_ref    text,
  new_ref    text,
  title      text,
  summary    text,
  source     text,
  tags       text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists legal_reference_kind_idx on legal_reference (kind);
create index if not exists legal_reference_tags_idx on legal_reference using gin (tags);
create index if not exists legal_reference_fts_idx on legal_reference
  using gin (to_tsvector('english', coalesce(topic,'') || ' ' || coalesce(old_ref,'') || ' ' || coalesce(new_ref,'') || ' ' || coalesce(title,'') || ' ' || coalesce(summary,'')));

-- Per-tenant retrieval corpus for the agent. Embedding column is added when an
-- embeddings provider is chosen (E6 gated); retrieval works on FTS today.
create table if not exists document_chunk (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  document_id uuid references document (id) on delete cascade,
  matter_id   uuid references matter (id) on delete set null,
  client_id   uuid references client (id) on delete set null,
  chunk_index int not null default 0,
  content     text not null,
  fts         tsvector generated always as (to_tsvector('english', coalesce(content,''))) stored,
  created_at  timestamptz not null default now()
);
create index if not exists document_chunk_tenant_idx on document_chunk (tenant_id);
create index if not exists document_chunk_doc_idx on document_chunk (document_id);
create index if not exists document_chunk_fts_idx on document_chunk using gin (fts);

-- ── RLS ──────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['msg_message','voice_recording','agent_thread','agent_turn','document_chunk'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;

-- legal_reference: world-readable reference data; writes only via service-role.
alter table legal_reference enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='legal_reference' and policyname='legal_reference_read') then
    create policy legal_reference_read on legal_reference for select using (true);
  end if;
end $$;

-- ── Seed: knowledge pack (assistive; verify against the bare acts) ────────────
insert into legal_reference (kind, topic, old_ref, new_ref, title, summary, source, tags) values
('section_map','Murder','IPC 302','BNS 103','Murder','Punishment for murder. IPC s.302 maps to BNS s.103.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Death by negligence','IPC 304A','BNS 106','Causing death by negligence','IPC s.304A maps to BNS s.106 (incl. higher punishment for certain rash acts).','BNS 2023', array['criminal','bns','ipc']),
('section_map','Attempt to murder','IPC 307','BNS 109','Attempt to murder','IPC s.307 maps to BNS s.109.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Voluntarily causing hurt','IPC 323','BNS 115','Voluntarily causing hurt','IPC s.323 maps to BNS s.115.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Cheating','IPC 420','BNS 318','Cheating and dishonestly inducing delivery of property','IPC s.420 maps to BNS s.318 (cheating offences consolidated under s.318).','BNS 2023', array['criminal','bns','ipc','cheating']),
('section_map','Cruelty to wife','IPC 498A','BNS 85','Cruelty by husband or relatives','IPC s.498A maps to BNS s.85 (s.86 defines cruelty).','BNS 2023', array['criminal','bns','ipc','matrimonial']),
('section_map','Defamation','IPC 499/500','BNS 356','Defamation','IPC ss.499–500 map to BNS s.356 (definition + punishment, incl. community service).','BNS 2023', array['criminal','bns','ipc','defamation']),
('section_map','Theft','IPC 379','BNS 303','Theft','IPC s.379 maps to BNS s.303.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Rape','IPC 376','BNS 64','Punishment for rape','IPC s.375 (definition) → BNS s.63; IPC s.376 (punishment) → BNS s.64.','BNS 2023', array['criminal','bns','ipc']),
('section_map','Sedition (repealed)','IPC 124A','BNS 152','Acts endangering sovereignty, unity and integrity of India','Sedition (IPC 124A) is repealed; BNS s.152 is the nearest new provision — NOT identical; verify applicability.','BNS 2023', array['criminal','bns','ipc','sedition']),
('section_map','FIR','CrPC 154','BNSS 173','Information in cognizable cases (FIR)','CrPC s.154 maps to BNSS s.173 (incl. e-FIR / zero-FIR provisions).','BNSS 2023', array['procedure','bnss','crpc','fir']),
('section_map','Statement to police','CrPC 161','BNSS 180','Examination of witnesses by police','CrPC s.161 maps to BNSS s.180.','BNSS 2023', array['procedure','bnss','crpc']),
('section_map','Confession before Magistrate','CrPC 164','BNSS 183','Recording of confessions and statements','CrPC s.164 maps to BNSS s.183.','BNSS 2023', array['procedure','bnss','crpc']),
('section_map','Arrest','CrPC 41','BNSS 35','When police may arrest without warrant','CrPC s.41 maps to BNSS s.35.','BNSS 2023', array['procedure','bnss','crpc','arrest']),
('section_map','Maintenance','CrPC 125','BNSS 144','Maintenance of wife, children and parents','CrPC s.125 maps to BNSS s.144.','BNSS 2023', array['procedure','bnss','crpc','maintenance']),
('section_map','Default bail / remand','CrPC 167','BNSS 187','Procedure when investigation cannot be completed in 24 hours','CrPC s.167 maps to BNSS s.187 (default bail timelines).','BNSS 2023', array['procedure','bnss','crpc','bail']),
('section_map','Bail powers','CrPC 437/439','BNSS 480/483','Bail in non-bailable offences / powers of HC & Sessions','CrPC s.437 → BNSS s.480; CrPC s.439 → BNSS s.483.','BNSS 2023', array['procedure','bnss','crpc','bail']),
('section_map','Inherent powers of High Court','CrPC 482','BNSS 528','Saving of inherent powers of the High Court','CrPC s.482 maps to BNSS s.528 (quashing / inherent powers).','BNSS 2023', array['procedure','bnss','crpc','quashing']),
('section_map','Electronic records','IEA 65B','BSA 63','Admissibility of electronic records','Indian Evidence Act s.65B maps to Bharatiya Sakshya Adhiniyam s.63; BSA treats electronic records as primary evidence.','BSA 2023', array['evidence','bsa','iea','electronic']),
('note','Evidence Act overhaul',null,'BSA 2023','Indian Evidence Act → Bharatiya Sakshya Adhiniyam','The Indian Evidence Act 1872 is replaced by the Bharatiya Sakshya Adhiniyam 2023 (effective 1 Jul 2024) — 170 sections; expanded treatment of electronic/digital evidence.','BSA 2023', array['evidence','bsa','iea']),
('procedure','Cheque bounce (NI Act 138)','NI Act 138',null,'Section 138 NI Act — dishonour of cheque flow','Cheque returned unpaid → statutory demand notice within 30 days of the bank''s return memo → drawer has 15 days to pay → on default, complaint before Magistrate within 30 days of expiry of the 15-day period. Limitation is strict.','Negotiable Instruments Act 1881', array['ni-act','cheque','138','limitation']),
('limitation','Suit for recovery of money',null,null,'Limitation — money suits','A suit for recovery of money/price of goods is generally 3 years from when the cause of action accrues (Limitation Act 1963, Sch.).','Limitation Act 1963', array['limitation','civil','recovery']),
('limitation','Appeals',null,null,'Limitation — common appeal periods','Appeal to High Court from a decree: 90 days; appeal to a subordinate court: 30 days (Limitation Act 1963, Sch.). Verify the specific article.','Limitation Act 1963', array['limitation','appeal']),
('note','Court hierarchy',null,null,'Indian court hierarchy (civil/criminal)','Supreme Court → High Courts → District & Sessions Courts → Civil Judge (Sr/Jr Dn) / Judicial Magistrate (CJM/JMFC). Tribunals run parallel for specialised matters.','General', array['hierarchy','courts'])
on conflict do nothing;
