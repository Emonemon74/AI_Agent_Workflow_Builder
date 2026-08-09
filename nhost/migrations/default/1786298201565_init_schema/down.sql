drop view if exists public.org_usage_current_period;

drop table if exists public.trigger_events;
drop table if exists public.notifications;
drop table if exists public.workflow_step_outputs;
drop table if exists public.step_runs;
drop table if exists public.workflow_runs;
drop table if exists public.workflow_triggers;
drop table if exists public.workflow_steps;
drop table if exists public.workflows;
drop table if exists public.org_members;
drop table if exists public.organizations;

drop type if exists public.step_run_status;
drop type if exists public.run_status;
drop type if exists public.trigger_type;
drop type if exists public.step_type;
drop type if exists public.org_role;
