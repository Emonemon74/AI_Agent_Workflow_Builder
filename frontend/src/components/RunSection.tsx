'use client';

import { useEffect, useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery, useSubscription } from '@apollo/client/react';
import { useOrg } from '@/lib/OrgProvider';

const TRIGGER_RUN = gql`
  mutation TriggerRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      workflow_run_id
      status
    }
  }
`;

const APPROVE_STEP = gql`
  mutation Approve($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      step_run_id
      status
      workflow_run_status
    }
  }
`;

const RUN_HISTORY = gql`
  query RunHistory($workflowId: uuid!) {
    workflow_runs(where: { workflow_id: { _eq: $workflowId } }, order_by: { started_at: desc }, limit: 10) {
      id
      status
      trigger_type
      started_at
      completed_at
    }
  }
`;

const RUN_STATUS_SUB = gql`
  subscription RunStatus($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      status
      error
      started_at
      completed_at
    }
  }
`;

const STEP_RUNS_SUB = gql`
  subscription StepRuns($runId: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: asc }) {
      id
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      workflow_step {
        step_order
        type
      }
    }
  }
`;

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-800',
  awaiting_approval: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-700',
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-400',
};

export function RunSection({ workflowId }: { workflowId: string }) {
  const { currentRole } = useOrg();
  const canRun = currentRole === 'owner' || currentRole === 'editor';
  const canApprove = currentRole === 'owner' || currentRole === 'editor';

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [triggerRun, { loading: triggering, error: triggerError }] = useMutation<{
    triggerWorkflowRun: { workflow_run_id: string; status: string };
  }>(TRIGGER_RUN);
  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  const { data: historyData, refetch: refetchHistory } = useQuery<{
    workflow_runs: { id: string; status: string; trigger_type: string; started_at: string; completed_at: string | null }[];
  }>(RUN_HISTORY, { variables: { workflowId }, fetchPolicy: 'cache-and-network' });

  useEffect(() => {
    if (!activeRunId && historyData?.workflow_runs?.[0]) {
      setActiveRunId(historyData.workflow_runs[0].id);
    }
  }, [historyData, activeRunId]);

  const { data: runStatusData } = useSubscription<{
    workflow_runs_by_pk: { id: string; status: string; error: string | null } | null;
  }>(RUN_STATUS_SUB, { variables: { id: activeRunId }, skip: !activeRunId });

  const { data: stepRunsData } = useSubscription<{
    step_runs: {
      id: string;
      status: string;
      input: unknown;
      output: unknown;
      error: string | null;
      attempt_count: number;
      approved_by: string | null;
      workflow_step: { step_order: number; type: string };
    }[];
  }>(STEP_RUNS_SUB, { variables: { runId: activeRunId }, skip: !activeRunId });

  async function onRun() {
    const res = await triggerRun({ variables: { workflowId } });
    const id = res.data?.triggerWorkflowRun?.workflow_run_id;
    if (id) setActiveRunId(id);
    refetchHistory();
  }

  const runStatus = runStatusData?.workflow_runs_by_pk?.status;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h3 className="font-medium">Runs</h3>
        {canRun && (
          <button
            onClick={onRun}
            disabled={triggering}
            className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {triggering ? 'Starting...' : 'Run'}
          </button>
        )}
        {runStatus && (
          <span className={`rounded px-2 py-1 text-xs ${STATUS_COLOR[runStatus] ?? ''}`}>{runStatus}</span>
        )}
      </div>
      {triggerError && <p className="text-sm text-red-600">{triggerError.message}</p>}

      <div className="flex gap-4">
        <ul className="flex w-40 flex-col gap-1 text-xs">
          {historyData?.workflow_runs.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setActiveRunId(r.id)}
                className={`w-full rounded border px-2 py-1 text-left ${activeRunId === r.id ? 'border-black' : ''}`}
              >
                <span className={`mr-1 rounded px-1 ${STATUS_COLOR[r.status] ?? ''}`}>{r.status}</span>
                <span className="text-gray-500">{r.trigger_type}</span>
              </button>
            </li>
          ))}
        </ul>

        <ol className="flex flex-1 flex-col gap-2">
          {stepRunsData?.step_runs.map((sr) => (
            <li key={sr.id} className="rounded border p-2 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  <span className="mr-2 font-mono text-xs text-gray-400">#{sr.workflow_step.step_order}</span>
                  <span className="font-medium">{sr.workflow_step.type}</span>
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[sr.status] ?? ''}`}>{sr.status}</span>
              </div>
              {sr.output != null && (
                <pre className="mt-1 max-w-full overflow-x-auto text-xs text-gray-500">
                  {JSON.stringify(sr.output)}
                </pre>
              )}
              {sr.error && <p className="mt-1 text-xs text-red-600">{sr.error}</p>}
              {sr.status === 'awaiting_approval' && (
                <div className="mt-2">
                  {canApprove ? (
                    <button
                      onClick={() => approveStep({ variables: { stepRunId: sr.id } })}
                      disabled={approving}
                      className="rounded bg-yellow-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Approve to resume
                    </button>
                  ) : (
                    <p className="text-xs text-gray-500">Waiting for an owner/editor to approve.</p>
                  )}
                </div>
              )}
            </li>
          ))}
          {!activeRunId && <p className="text-sm text-gray-500">No runs yet.</p>}
        </ol>
      </div>
    </div>
  );
}
