'use client';

import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import Link from 'next/link';
import { useOrg } from '@/lib/OrgProvider';

const WORKFLOWS = gql`
  query Workflows($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      steps(order_by: { step_order: asc }) {
        id
        type
      }
      triggers {
        id
        type
      }
      runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
      }
    }
  }
`;

const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($orgId: uuid!, $name: String!) {
    insert_workflows_one(object: { org_id: $orgId, name: $name }) {
      id
    }
  }
`;

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  steps: { id: string; type: string }[];
  triggers: { id: string; type: string }[];
  runs: { id: string; status: string; started_at: string }[];
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function WorkflowList() {
  const { currentOrgId, currentRole } = useOrg();
  const canWrite = currentRole === 'owner' || currentRole === 'editor';
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const { data, loading, refetch } = useQuery<{ workflows: Workflow[] }>(WORKFLOWS, {
    variables: { orgId: currentOrgId },
    skip: !currentOrgId,
    fetchPolicy: 'cache-and-network',
  });

  const [createWorkflow, { loading: createLoading }] = useMutation(CREATE_WORKFLOW);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrgId || !name.trim()) return;
    await createWorkflow({ variables: { orgId: currentOrgId, name: name.trim() } });
    setName('');
    setCreating(false);
    refetch();
  }

  if (!currentOrgId) return <p className="text-sm text-gray-500">Select an organization.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workflows</h2>
        {canWrite && (
          <button onClick={() => setCreating((v) => !v)} className="rounded bg-black px-3 py-1.5 text-sm text-white">
            New workflow
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={onCreate} className="flex gap-2">
          <input
            autoFocus
            required
            placeholder="Workflow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border px-3 py-1.5 text-sm"
          />
          <button type="submit" disabled={createLoading} className="rounded bg-black px-3 py-1.5 text-sm text-white">
            Create
          </button>
        </form>
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data?.workflows.map((wf) => {
            const lastRun = wf.runs[0];
            return (
              <li key={wf.id} className="rounded border p-3">
                <Link href={`/workflows/${wf.id}`} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{wf.name}</p>
                    <p className="text-xs text-gray-500">
                      {wf.steps.length} step{wf.steps.length === 1 ? '' : 's'} · {wf.triggers.length} trigger
                      {wf.triggers.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {lastRun ? (
                    <span className={`rounded px-2 py-1 text-xs ${STATUS_COLOR[lastRun.status] ?? ''}`}>
                      {lastRun.status}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">never run</span>
                  )}
                </Link>
              </li>
            );
          })}
          {data?.workflows.length === 0 && <p className="text-sm text-gray-500">No workflows yet.</p>}
        </ul>
      )}
    </div>
  );
}
