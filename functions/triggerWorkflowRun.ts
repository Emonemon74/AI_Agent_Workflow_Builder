import type { Request, Response } from 'express';
import { adminGraphQL } from './_lib/hasura';
import { getOrgRole, getOrgQuota, getWorkflowOrgId, getSessionUserId } from './_lib/authz';
import { startEngineRun } from './_lib/workflowEngine';

export default async (req: Request, res: Response) => {
  const workflowId: string | undefined = req.body?.input?.workflow_id;
  const sessionVariables = req.body?.session_variables;
  const userId = getSessionUserId(sessionVariables);

  if (!workflowId || !userId) {
    return res.status(400).json({ message: 'workflow_id and an authenticated caller are required' });
  }

  const orgId = await getWorkflowOrgId(workflowId);
  if (!orgId) {
    return res.status(404).json({ message: 'workflow not found' });
  }

  // 1. Verify the caller is owner/editor in the workflow's org.
  const role = await getOrgRole(orgId, userId);
  if (role !== 'owner' && role !== 'editor') {
    return res.status(403).json({ message: 'only an owner or editor can trigger a run' });
  }

  // 2. Check the org's quota isn't exhausted.
  const quota = await getOrgQuota(orgId);
  if (!quota || quota.quota_used >= quota.quota_limit) {
    return res.status(400).json({ message: 'organization quota exhausted' });
  }

  // 3. Create the workflow_run, then execute steps in order.
  const created = await adminGraphQL<{ insert_workflow_runs_one: { id: string } }>(
    `mutation ($object: workflow_runs_insert_input!) {
      insert_workflow_runs_one(object: $object) { id }
    }`,
    { object: { workflow_id: workflowId, status: 'running', trigger_type: 'manual', triggered_by: userId } },
  );
  const workflowRunId = created.insert_workflow_runs_one.id;

  try {
    const outcome = await startEngineRun(workflowId, workflowRunId, orgId);
    return res.status(200).json({ workflow_run_id: workflowRunId, status: outcome.status });
  } catch (err: any) {
    return res.status(500).json({ message: `engine error: ${err?.message ?? err}` });
  }
};
