-- Tracks the last time a scheduled trigger fired, so the per-minute cron
-- poll can dedupe within the same minute and know what's due.
alter table public.workflow_triggers
  add column last_run_at timestamptz;
