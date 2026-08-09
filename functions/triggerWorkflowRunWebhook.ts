import type { Request, Response } from 'express';
import crypto from 'crypto';
import { adminGraphQL } from './_lib/hasura';
import { getOrgQuota } from './_lib/authz';
import { startEngineRun } from './_lib/workflowEngine';

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async (req: Request, res: Response) => {
  const workflowId: string | undefined = req.body?.input?.workflow_id;
  const secret: string | undefined = req.body?.input?.secret;

  if (!workflowId || !secret) {
    return res.status(400).json({ message: 'workflow_id and secret are required' });
  }

  const data = await adminGraphQL<{
    workflows_by_pk: { org_id: string } | null;
    workflow_triggers: { config: { secret?: string } }[];
  }>(
    `query ($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) { org_id }
      workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: webhook } }, limit: 1) {
        config
      }
    }`,
    { workflowId },
  );

  const orgId = data.workflows_by_pk?.org_id;
  const trigger = data.workflow_triggers[0];
  if (!orgId || !trigger?.config?.secret) {
    return res.status(404).json({ message: 'no webhook trigger configured for this workflow' });
  }
  if (!timingSafeEqual(secret, trigger.config.secret)) {
    return res.status(401).json({ message: 'invalid webhook secret' });
  }

  const quota = await getOrgQuota(orgId);
  if (!quota || quota.quota_used >= quota.quota_limit) {
    return res.status(400).json({ message: 'organization quota exhausted' });
  }

  const created = await adminGraphQL<{ insert_workflow_runs_one: { id: string } }>(
    `mutation ($object: workflow_runs_insert_input!) {
      insert_workflow_runs_one(object: $object) { id }
    }`,
    { object: { workflow_id: workflowId, status: 'running', trigger_type: 'webhook', triggered_by: null } },
  );
  const workflowRunId = created.insert_workflow_runs_one.id;

  try {
    const outcome = await startEngineRun(workflowId, workflowRunId, orgId);
    return res.status(200).json({ workflow_run_id: workflowRunId, status: outcome.status });
  } catch (err: any) {
    return res.status(500).json({ message: `engine error: ${err?.message ?? err}` });
  }
};
