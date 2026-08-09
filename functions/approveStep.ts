import type { Request, Response } from 'express';
import { adminGraphQL } from './_lib/hasura';
import { getOrgRole, getSessionUserId } from './_lib/authz';
import { resumeEngineRun } from './_lib/workflowEngine';

interface StepRunDetail {
  id: string;
  status: string;
  workflow_step: { step_order: number; workflow_id: string };
  workflow_run: { id: string; status: string; workflow: { org_id: string } };
}

export default async (req: Request, res: Response) => {
  const stepRunId: string | undefined = req.body?.input?.step_run_id;
  const sessionVariables = req.body?.session_variables;
  const userId = getSessionUserId(sessionVariables);

  if (!stepRunId || !userId) {
    return res.status(400).json({ message: 'step_run_id and an authenticated caller are required' });
  }

  const data = await adminGraphQL<{ step_runs_by_pk: StepRunDetail | null }>(
    `query ($id: uuid!) {
      step_runs_by_pk(id: $id) {
        id
        status
        workflow_step { step_order workflow_id }
        workflow_run { id status workflow { org_id } }
      }
    }`,
    { id: stepRunId },
  );

  const stepRun = data.step_runs_by_pk;
  if (!stepRun) {
    return res.status(404).json({ message: 'step run not found' });
  }
  if (stepRun.status !== 'awaiting_approval') {
    return res.status(400).json({ message: 'step run is not awaiting approval' });
  }

  const orgId = stepRun.workflow_run.workflow.org_id;

  // Layer 2b: mid-execution decision, so it's checked here in code rather than
  // as a declarative Hasura permission (there's no "row" representing "resume this run").
  const role = await getOrgRole(orgId, userId);
  if (role !== 'owner' && role !== 'editor') {
    return res.status(403).json({ message: 'only an owner or editor in this organization can approve this step' });
  }

  const approvedAt = new Date().toISOString();
  await adminGraphQL(
    `mutation ($id: uuid!, $userId: uuid!, $approvedAt: timestamptz!) {
      update_step_runs_by_pk(
        pk_columns: { id: $id }
        _set: { status: "succeeded", approved_by: $userId, approved_at: $approvedAt, output: { approved: true }, completed_at: $approvedAt }
      ) { id }
    }`,
    { id: stepRunId, userId, approvedAt },
  );

  const workflowId = stepRun.workflow_step.workflow_id;
  const workflowRunId = stepRun.workflow_run.id;
  const nextStepOrder = stepRun.workflow_step.step_order + 1;

  try {
    const outcome = await resumeEngineRun(workflowId, workflowRunId, orgId, nextStepOrder, { approved: true });
    return res.status(200).json({ step_run_id: stepRunId, status: 'succeeded', workflow_run_status: outcome.status });
  } catch (err: any) {
    return res.status(500).json({ message: `engine error: ${err?.message ?? err}` });
  }
};
