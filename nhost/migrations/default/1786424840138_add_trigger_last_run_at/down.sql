alter table public.workflow_triggers
  drop column if exists last_run_at;
