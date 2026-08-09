import type { Request, Response } from 'express';
import { adminGraphQL } from './_lib/hasura';
import { getOrgQuota } from './_lib/authz';
import { startEngineRun } from './_lib/workflowEngine';

// Hasura Event Trigger webhook, fired on INSERT into public.trigger_events.
// This is the "database event" trigger type: a row change in a watched table
// auto-starts a run, with no button click involved.
export default async (req: Request, res: Response) => {
  const newRow = req.body?.event?.data?.new;
  const orgId: string | undefined = newRow?.org_id;
  const workflowId: string | undefined = newRow?.workflow_id;

  if (!orgId || !workflowId) {
    return res.status(200).json({ skipped: true, reason: 'missing org_id/workflow_id on trigger_events row' });
  }

  const data = await adminGraphQL<{ workflow_triggers: { id: string }[] }>(
    `query ($workflowId: uuid!) {
      workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: event } }, limit: 1) {
        id
      }
    }`,
    { workflowId },
  );
  if (data.workflow_triggers.length === 0) {
    return res.status(200).json({ skipped: true, reason: 'no event trigger configured for this workflow' });
  }

  const quota = await getOrgQuota(orgId);
  if (!quota || quota.quota_used >= quota.quota_limit) {
    return res.status(200).json({ skipped: true, reason: 'organization quota exhausted' });
  }

  const created = await adminGraphQL<{ insert_workflow_runs_one: { id: string } }>(
    `mutation ($object: workflow_runs_insert_input!) {
      insert_workflow_runs_one(object: $object) { id }
    }`,
    { object: { workflow_id: workflowId, status: 'running', trigger_type: 'event', triggered_by: null } },
  );
  const workflowRunId = created.insert_workflow_runs_one.id;

  try {
    const outcome = await startEngineRun(workflowId, workflowRunId, orgId);
    return res.status(200).json({ workflow_run_id: workflowRunId, status: outcome.status });
  } catch (err: any) {
    // Non-2xx makes Hasura retry the event delivery once per retry_conf.
    return res.status(500).json({ message: `engine error: ${err?.message ?? err}` });
  }
};
