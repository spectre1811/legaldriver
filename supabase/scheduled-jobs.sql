-- High-frequency scheduling via Supabase pg_cron + pg_net (bypasses Vercel Hobby's
-- daily-only cron limit). Apply against the project, replacing __CRON_SECRET__ and
-- the base URL. NOTE: the real secret is NOT committed — apply this out-of-band
-- (Management API / SQL editor); the value then lives only in the cron.job table.
-- See docs/decisions/2026-06-24-cron-scheduling.md.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- idempotent (re)schedule
select cron.unschedule('ld_notify')   where exists (select 1 from cron.job where jobname='ld_notify');
select cron.unschedule('ld_escalate') where exists (select 1 from cron.job where jobname='ld_escalate');
select cron.unschedule('ld_gmail')    where exists (select 1 from cron.job where jobname='ld_gmail');

select cron.schedule('ld_notify', '*/15 * * * *', $job$
  select net.http_get(
    url:='https://legaldriver.vercel.app/api/cron/notify',
    headers:=jsonb_build_object('Authorization','Bearer __CRON_SECRET__'),
    timeout_milliseconds:=30000);
$job$);

select cron.schedule('ld_escalate', '0 * * * *', $job$
  select net.http_get(
    url:='https://legaldriver.vercel.app/api/cron/escalate',
    headers:=jsonb_build_object('Authorization','Bearer __CRON_SECRET__'),
    timeout_milliseconds:=30000);
$job$);

select cron.schedule('ld_gmail', '*/30 * * * *', $job$
  select net.http_get(
    url:='https://legaldriver.vercel.app/api/cron/gmail',
    headers:=jsonb_build_object('Authorization','Bearer __CRON_SECRET__'),
    timeout_milliseconds:=30000);
$job$);

-- inspect:  select * from cron.job;
-- runs:     select * from cron.job_run_details order by start_time desc limit 20;
-- responses select id, status_code from net._http_response order by id desc limit 5;
