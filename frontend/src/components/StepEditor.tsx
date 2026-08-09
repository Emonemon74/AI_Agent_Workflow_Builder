'use client';

import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { extractErrorMessage } from '@/lib/errors';

const STEP_FIELDS = gql`
  fragment StepFields on workflow_steps {
    id
    step_order
    type
    name
    config
  }
`;

const INSERT_STEP = gql`
  mutation InsertStep($workflowId: uuid!, $stepOrder: Int!, $type: step_type!, $name: String!, $config: jsonb!) {
    insert_workflow_steps_one(
      object: { workflow_id: $workflowId, step_order: $stepOrder, type: $type, name: $name, config: $config }
    ) {
      ...StepFields
    }
  }
  ${STEP_FIELDS}
`;

const UPDATE_STEP = gql`
  mutation UpdateStep($id: uuid!, $stepOrder: Int, $config: jsonb, $name: String) {
    update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { step_order: $stepOrder, config: $config, name: $name }) {
      ...StepFields
    }
  }
  ${STEP_FIELDS}
`;

const DELETE_STEP = gql`
  mutation DeleteStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

export interface Step {
  id: string;
  step_order: number;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

const STEP_TYPES = ['llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate'] as const;

const CONFIG_HINTS: Record<string, string> = {
  llm_call: '{"prompt": "Say hello", "model": "llama-3.1-8b-instant"}',
  http_request: '{"url": "https://example.com", "method": "GET"}',
  db_write: '{"data": {}}  // omit "data" to store the previous step\'s output',
  notify: '{"message": "{{previous.text}}", "channel": "log"}',
  conditional_branch: '{"path": "text", "operator": "contains", "value": "positive"}',
  approval_gate: '{}',
};

export function StepEditor({
  workflowId,
  steps,
  canWrite,
  isOwner,
  onChanged,
}: {
  workflowId: string;
  steps: Step[];
  canWrite: boolean;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [insertStep] = useMutation(INSERT_STEP);
  const [updateStep] = useMutation(UPDATE_STEP);
  const [deleteStep] = useMutation(DELETE_STEP);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<(typeof STEP_TYPES)[number]>('llm_call');
  const [newConfig, setNewConfig] = useState(CONFIG_HINTS.llm_call);
  const [error, setError] = useState<string | null>(null);

  const restrictedTypes = new Set(['db_write', 'notify']);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(newConfig);
    } catch {
      setError('Config must be valid JSON');
      return;
    }
    try {
      await insertStep({
        variables: {
          workflowId,
          stepOrder: (steps[steps.length - 1]?.step_order ?? 0) + 1,
          type: newType,
          name: newType,
          config: parsed,
        },
      });
      setAdding(false);
      onChanged();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to add step'));
    }
  }

  async function move(step: Step, direction: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === step.id);
    const otherIdx = idx + direction;
    if (otherIdx < 0 || otherIdx >= steps.length) return;
    const other = steps[otherIdx];
    // Swap via a temporary value to avoid violating the unique(workflow_id, step_order) constraint.
    await updateStep({ variables: { id: step.id, stepOrder: -1 } });
    await updateStep({ variables: { id: other.id, stepOrder: step.step_order } });
    await updateStep({ variables: { id: step.id, stepOrder: other.step_order } });
    onChanged();
  }

  async function remove(id: string) {
    await deleteStep({ variables: { id } });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Steps</h3>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <div>
              <span className="mr-2 font-mono text-xs text-gray-400">#{step.step_order}</span>
              <span className="font-medium">{step.type}</span>
              <pre className="mt-1 max-w-md overflow-x-auto text-xs text-gray-500">
                {JSON.stringify(step.config)}
              </pre>
            </div>
            {canWrite && (isOwner || !restrictedTypes.has(step.type)) && (
              <div className="flex gap-1">
                <button disabled={i === 0} onClick={() => move(step, -1)} className="px-1 disabled:opacity-30">
                  ↑
                </button>
                <button
                  disabled={i === steps.length - 1}
                  onClick={() => move(step, 1)}
                  className="px-1 disabled:opacity-30"
                >
                  ↓
                </button>
                <button onClick={() => remove(step.id)} className="px-1 text-red-600">
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
        {steps.length === 0 && <p className="text-sm text-gray-500">No steps yet.</p>}
      </ol>

      {canWrite && (
        <>
          {adding ? (
            <form onSubmit={onAdd} className="flex flex-col gap-2 rounded border p-3">
              <select
                value={newType}
                onChange={(e) => {
                  const t = e.target.value as (typeof STEP_TYPES)[number];
                  setNewType(t);
                  setNewConfig(CONFIG_HINTS[t]);
                }}
                className="rounded border px-2 py-1 text-sm"
              >
                {STEP_TYPES.filter((t) => isOwner || !restrictedTypes.has(t)).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <textarea
                value={newConfig}
                onChange={(e) => setNewConfig(e.target.value)}
                rows={3}
                className="rounded border px-2 py-1 font-mono text-xs"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-black px-3 py-1.5 text-sm text-white">
                  Add step
                </button>
                <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="self-start text-sm underline">
              + Add step
            </button>
          )}
        </>
      )}
    </div>
  );
}
