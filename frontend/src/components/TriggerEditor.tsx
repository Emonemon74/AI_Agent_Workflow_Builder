'use client';

import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { extractErrorMessage } from '@/lib/errors';

const INSERT_TRIGGER = gql`
  mutation InsertTrigger($workflowId: uuid!, $type: trigger_type!, $config: jsonb!) {
    insert_workflow_triggers_one(object: { workflow_id: $workflowId, type: $type, config: $config }) {
      id
      type
      config
    }
  }
`;

const DELETE_TRIGGER = gql`
  mutation DeleteTrigger($id: uuid!) {
    delete_workflow_triggers_by_pk(id: $id) {
      id
    }
  }
`;

export interface Trigger {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

const TRIGGER_TYPES = ['manual', 'webhook', 'scheduled', 'event'] as const;

export function TriggerEditor({
  workflowId,
  triggers,
  canWrite,
  isOwner,
  onChanged,
}: {
  workflowId: string;
  triggers: Trigger[];
  canWrite: boolean;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [insertTrigger] = useMutation(INSERT_TRIGGER);
  const [deleteTrigger] = useMutation(DELETE_TRIGGER);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<(typeof TRIGGER_TYPES)[number]>('webhook');
  const [secret, setSecret] = useState('');
  const [cron, setCron] = useState('*/5 * * * *');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const config = type === 'webhook' ? { secret } : type === 'scheduled' ? { cron } : {};
    try {
      await insertTrigger({ variables: { workflowId, type, config } });
      setAdding(false);
      setSecret('');
      onChanged();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to add trigger'));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Triggers</h3>
      <ul className="flex flex-col gap-2">
        {triggers.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <div>
              <span className="font-medium">{t.type}</span>
              {t.type === 'webhook' && (
                <p className="mt-1 break-all font-mono text-xs text-gray-500">
                  call triggerWorkflowRunWebhook(workflow_id: &quot;{workflowId}&quot;, secret: &quot;
                  {String(t.config.secret ?? '')}&quot;)
                </p>
              )}
              {t.type === 'scheduled' && <p className="text-xs text-gray-500">cron: {String(t.config.cron)}</p>}
            </div>
            {canWrite && (isOwner || t.type !== 'webhook') && (
              <button onClick={() => deleteTrigger({ variables: { id: t.id } }).then(onChanged)} className="text-red-600">
                ✕
              </button>
            )}
          </li>
        ))}
        {triggers.length === 0 && <p className="text-sm text-gray-500">No triggers attached.</p>}
      </ul>

      {canWrite && (
        <>
          {adding ? (
            <form onSubmit={onAdd} className="flex flex-col gap-2 rounded border p-3">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as (typeof TRIGGER_TYPES)[number])}
                className="rounded border px-2 py-1 text-sm"
              >
                {TRIGGER_TYPES.filter((t) => isOwner || t !== 'webhook').map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {type === 'webhook' && (
                <input
                  required
                  placeholder="Webhook secret"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                />
              )}
              {type === 'scheduled' && (
                <input
                  required
                  placeholder="Cron expression"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                />
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-black px-3 py-1.5 text-sm text-white">
                  Add trigger
                </button>
                <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="self-start text-sm underline">
              + Add trigger
            </button>
          )}
        </>
      )}
    </div>
  );
}
