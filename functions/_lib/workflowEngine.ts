import { adminGraphQL } from './hasura';
import { interpolate } from './util';
import { executors } from './steps';

export interface WorkflowStep {
  id: string;
  step_order: number;
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
  config: Record<string, any>;
}

interface EngineContext {
  workflowRunId: string;
  orgId: string;
  steps: WorkflowStep[];
  stepRunIds: string[]; // aligned with steps by index
}

export type EngineOutcome = { status: 'completed' | 'failed' | 'paused' };

async function fetchOrderedSteps(workflowId: string): Promise<WorkflowStep[]> {
  const data = await adminGraphQL<{ workflow_steps: WorkflowStep[] }>(
    `query ($workflowId: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { step_order: asc }) {
        id
        step_order
        type
        config
      }
    }`,
    { workflowId },
  );
  return data.workflow_steps;
}

async function createPendingStepRuns(workflowRunId: string, steps: WorkflowStep[]): Promise<string[]> {
  const objects = steps.map((s) => ({ workflow_run_id: workflowRunId, workflow_step_id: s.id, status: 'pending' }));
  const data = await adminGraphQL<{ insert_step_runs: { returning: { id: string }[] } }>(
    `mutation ($objects: [step_runs_insert_input!]!) {
      insert_step_runs(objects: $objects) {
        returning { id }
      }
    }`,
    { objects },
  );
  return data.insert_step_runs.returning.map((r) => r.id);
}

async function updateStepRun(stepRunId: string, patch: Record<string, unknown>) {
  await adminGraphQL(
    `mutation ($id: uuid!, $patch: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: $patch) { id }
    }`,
    { id: stepRunId, patch },
  );
}

async function updateWorkflowRun(workflowRunId: string, patch: Record<string, unknown>) {
  await adminGraphQL(
    `mutation ($id: uuid!, $patch: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $patch) { id }
    }`,
    { id: workflowRunId, patch },
  );
}

async function incrementQuota(orgId: string, by: number) {
  await adminGraphQL(
    `mutation ($id: uuid!, $by: Int!) {
      update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: $by }) { id }
    }`,
    { id: orgId, by },
  );
}

async function insertStepOutput(orgId: string, workflowRunId: string, stepRunId: string, data: unknown) {
  await adminGraphQL(
    `mutation ($object: workflow_step_outputs_insert_input!) {
      insert_workflow_step_outputs_one(object: $object) { id }
    }`,
    { object: { org_id: orgId, workflow_run_id: workflowRunId, step_run_id: stepRunId, data } },
  );
}

async function insertNotification(orgId: string, workflowRunId: string, stepRunId: string, channel: string, message: string) {
  await adminGraphQL(
    `mutation ($object: notifications_insert_input!) {
      insert_notifications_one(object: $object) { id }
    }`,
    { object: { org_id: orgId, workflow_run_id: workflowRunId, step_run_id: stepRunId, channel, message } },
  );
}

async function runLoop(ctx: EngineContext, startIndex: number, initialPreviousOutput: unknown): Promise<EngineOutcome> {
  let previousOutput = initialPreviousOutput;
  let externalCallCount = 0;

  for (let i = startIndex; i < ctx.steps.length; i++) {
    const step = ctx.steps[i];
    const stepRunId = ctx.stepRunIds[i];
    await updateStepRun(stepRunId, { status: 'running', started_at: new Date().toISOString() });

    try {
      if (step.type === 'approval_gate') {
        await updateStepRun(stepRunId, { status: 'awaiting_approval', input: previousOutput ?? null });
        await updateWorkflowRun(ctx.workflowRunId, { status: 'paused' });
        return { status: 'paused' };
      }

      if (step.type === 'db_write') {
        const data = step.config?.data ?? previousOutput ?? null;
        await insertStepOutput(ctx.orgId, ctx.workflowRunId, stepRunId, data);
        await updateStepRun(stepRunId, {
          status: 'succeeded',
          input: data,
          output: data,
          attempt_count: 1,
          completed_at: new Date().toISOString(),
        });
        previousOutput = data;
        continue;
      }

      if (step.type === 'notify') {
        const message = interpolate(step.config?.message ?? '', previousOutput);
        const channel = step.config?.channel || 'log';
        await insertNotification(ctx.orgId, ctx.workflowRunId, stepRunId, channel, message);
        await updateStepRun(stepRunId, {
          status: 'succeeded',
          input: { message, channel },
          output: { queued: true },
          attempt_count: 1,
          completed_at: new Date().toISOString(),
        });
        previousOutput = { message };
        continue;
      }

      if (step.type === 'conditional_branch') {
        const { input, output, matched } = await executors.conditional_branch(step.config, previousOutput);
        await updateStepRun(stepRunId, {
          status: 'succeeded',
          input,
          output,
          attempt_count: 1,
          completed_at: new Date().toISOString(),
        });
        previousOutput = output;

        if (!matched && ctx.steps[i + 1]) {
          const skippedRunId = ctx.stepRunIds[i + 1];
          await updateStepRun(skippedRunId, { status: 'skipped', completed_at: new Date().toISOString() });
          i++; // consume the skipped step
        }
        continue;
      }

      // llm_call / http_request
      const executor = executors[step.type as 'llm_call' | 'http_request'];
      const { input, output, attempts } = await executor(step.config, previousOutput);
      await updateStepRun(stepRunId, {
        status: 'succeeded',
        input,
        output,
        attempt_count: attempts ?? 1,
        completed_at: new Date().toISOString(),
      });
      previousOutput = output;
      externalCallCount++;
    } catch (err: any) {
      const message = err?.message ? String(err.message) : String(err);
      await updateStepRun(stepRunId, {
        status: 'failed',
        error: message,
        attempt_count: step.type === 'llm_call' || step.type === 'http_request' ? 2 : 1,
        completed_at: new Date().toISOString(),
      });
      await updateWorkflowRun(ctx.workflowRunId, {
        status: 'failed',
        error: message,
        completed_at: new Date().toISOString(),
      });
      return { status: 'failed' };
    }
  }

  await updateWorkflowRun(ctx.workflowRunId, { status: 'completed', completed_at: new Date().toISOString() });
  if (externalCallCount > 0) {
    await incrementQuota(ctx.orgId, externalCallCount);
  }
  return { status: 'completed' };
}

export async function startEngineRun(workflowId: string, workflowRunId: string, orgId: string): Promise<EngineOutcome> {
  const steps = await fetchOrderedSteps(workflowId);
  const stepRunIds = await createPendingStepRuns(workflowRunId, steps);
  return runLoop({ workflowRunId, orgId, steps, stepRunIds }, 0, undefined);
}

export async function resumeEngineRun(
  workflowId: string,
  workflowRunId: string,
  orgId: string,
  resumeFromStepOrder: number,
  previousOutput: unknown,
): Promise<EngineOutcome> {
  const steps = await fetchOrderedSteps(workflowId);
  const data = await adminGraphQL<{ step_runs: { id: string; workflow_step_id: string }[] }>(
    `query ($workflowRunId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $workflowRunId } }) {
        id
        workflow_step_id
      }
    }`,
    { workflowRunId },
  );
  const stepRunIdByStepId = new Map(data.step_runs.map((sr) => [sr.workflow_step_id, sr.id]));
  const stepRunIds = steps.map((s) => stepRunIdByStepId.get(s.id)!);
  const fromIndex = steps.findIndex((s) => s.step_order === resumeFromStepOrder);

  await updateWorkflowRun(workflowRunId, { status: 'running' });
  return runLoop({ workflowRunId, orgId, steps, stepRunIds }, fromIndex === -1 ? steps.length : fromIndex, previousOutput);
}
