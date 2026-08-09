-- AI Agent Workflow Builder: core schema
create extension if not exists pgcrypto;

create type public.org_role as enum ('owner', 'editor', 'viewer');
create type public.step_type as enum ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
create type public.trigger_type as enum ('manual', 'webhook', 'scheduled', 'event');
create type public.run_status as enum ('pending', 'running', 'paused', 'completed', 'failed');
create type public.step_run_status as enum ('pending', 'running', 'succeeded', 'failed', 'awaiting_approval', 'skipped');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_limit int not null default 100,
  quota_used int not null default 0,
  quota_period_start timestamptz not null default date_trunc('month', now()),
  created_at timestamptz not null default now()
);

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  step_order int not null,
  type public.step_type not null,
  name text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_id, step_order)
);

create table public.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  type public.trigger_type not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  status public.run_status not null default 'pending',
  trigger_type public.trigger_type not null,
  triggered_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create table public.step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id) on delete cascade,
  status public.step_run_status not null default 'pending',
  input jsonb,
  output jsonb,
  error text,
  attempt_count int not null default 0,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Target table for db_write steps ("saves a result into your own tables").
create table public.workflow_step_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_run_id uuid not null references public.step_runs(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- notify steps insert here; a Hasura Event Trigger on insert sends the alert.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  step_run_id uuid references public.step_runs(id) on delete cascade,
  channel text not null default 'log',
  message text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Generic "watched table" for the database-event trigger demo.
create table public.trigger_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.org_members (user_id);
create index on public.org_members (org_id);
create index on public.workflows (org_id);
create index on public.workflow_steps (workflow_id);
create index on public.workflow_triggers (workflow_id);
create index on public.workflow_runs (workflow_id);
create index on public.step_runs (workflow_run_id);
create index on public.step_runs (workflow_step_id);
create index on public.workflow_step_outputs (org_id);
create index on public.notifications (org_id);
create index on public.trigger_events (workflow_id);

-- Aggregation: org-level usage this month + average run duration.
create view public.org_usage_current_period as
select
  o.id as org_id,
  o.quota_limit,
  o.quota_used,
  count(wr.id) filter (where wr.started_at >= date_trunc('month', now())) as runs_this_month,
  avg(extract(epoch from (wr.completed_at - wr.started_at)))
    filter (where wr.completed_at is not null) as avg_run_duration_seconds
from public.organizations o
left join public.workflows w on w.org_id = o.id
left join public.workflow_runs wr on wr.workflow_id = w.id
group by o.id, o.quota_limit, o.quota_used;
