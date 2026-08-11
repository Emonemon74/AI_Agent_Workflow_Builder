import type { Request, Response } from 'express';
import { adminGraphQL } from './_lib/hasura';
import { getOrgQuota } from './_lib/authz';
import { startEngineRun } from './_lib/workflowEngine';
import { matchesCron, truncateToMinute } from './_lib/cron';

// Hasura cron trigger, fired once a minute (see nhost/metadata/cron_triggers.yaml).
// This is the "scheduled" trigger type: each workflow_triggers row of type
// 'scheduled' carries its own cron expression in config.cron; this poll finds
// the ones due this minute and starts a run for each, with no button click.
interface ScheduledTrigger {
  id: string;
  config: { cron?: string };
  last_run_at: string | null;
  workflow: { id: string; org_id: string } | null;
}

export default async (_req: Request, res: Response) => {
  const now = new Date();
  const nowMinute = truncateToMinute(now);

  const data = await adminGraphQL<{ workflow_triggers: ScheduledTrigger[] }>(
    `query {
      workflow_triggers(where: { type: { _eq: scheduled } }) {
        id
        config
        last_run_at
        workflow {
          id
          org_id
        }
      }
    }`,
  );

  const results: { trigger_id: string; workflow_run_id?: string; status: string }[] = [];

  for (const trigger of data.workflow_triggers) {
    const cron = trigger.config?.cron;
    const workflowId = trigger.workflow?.id;
    const orgId = trigger.workflow?.org_id;
    if (!cron || !workflowId || !orgId) continue;

    // Dedupe: skip if already fired this same minute (retry delivery, clock skew).
    if (trigger.last_run_at && truncateToMinute(new Date(trigger.last_run_at)) === nowMinute) continue;
    if (!matchesCron(cron, now)) continue;

    // Claim this minute before doing any work, so a retried cron delivery
    // (or a slow run overlapping the next tick) can't double-fire it.
    await adminGraphQL(
      `mutation ($id: uuid!, $lastRunAt: timestamptz!) {
        update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { last_run_at: $lastRunAt }) { id }
      }`,
      { id: trigger.id, lastRunAt: now.toISOString() },
    );

    const quota = await getOrgQuota(orgId);
    if (!quota || quota.quota_used >= quota.quota_limit) {
      results.push({ trigger_id: trigger.id, status: 'skipped: quota exhausted' });
      continue;
    }

    const created = await adminGraphQL<{ insert_workflow_runs_one: { id: string } }>(
      `mutation ($object: workflow_runs_insert_input!) {
        insert_workflow_runs_one(object: $object) { id }
      }`,
      { object: { workflow_id: workflowId, status: 'running', trigger_type: 'scheduled', triggered_by: null } },
    );
    const workflowRunId = created.insert_workflow_runs_one.id;

    try {
      const outcome = await startEngineRun(workflowId, workflowRunId, orgId);
      results.push({ trigger_id: trigger.id, workflow_run_id: workflowRunId, status: outcome.status });
    } catch (err: any) {
      results.push({ trigger_id: trigger.id, workflow_run_id: workflowRunId, status: `engine error: ${err?.message ?? err}` });
    }
  }

  return res.status(200).json({ checked: data.workflow_triggers.length, fired: results });
};
