'use client';

import { use } from 'react';
import Link from 'next/link';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { AuthGate } from '@/components/AuthGate';
import { OrgPicker } from '@/components/OrgPicker';
import { useOrg } from '@/lib/OrgProvider';
import { StepEditor, type Step } from '@/components/StepEditor';
import { TriggerEditor, type Trigger } from '@/components/TriggerEditor';
import { RunSection } from '@/components/RunSection';

const WORKFLOW = gql`
  query Workflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        name
        config
      }
      triggers {
        id
        type
        config
      }
    }
  }
`;

function WorkflowDetail({ id }: { id: string }) {
  const { currentRole } = useOrg();
  const canWrite = currentRole === 'owner' || currentRole === 'editor';
  const isOwner = currentRole === 'owner';

  const { data, loading, refetch } = useQuery<{
    workflows_by_pk: { id: string; name: string; description: string | null; steps: Step[]; triggers: Trigger[] } | null;
  }>(WORKFLOW, { variables: { id }, fetchPolicy: 'cache-and-network' });

  const wf = data?.workflows_by_pk;

  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl">
        <OrgPicker />
        <div className="flex flex-col gap-6 p-6">
          <Link href="/" className="text-sm underline">
            ← All workflows
          </Link>
          {loading && !wf && <p className="text-sm text-gray-500">Loading...</p>}
          {!loading && !wf && <p className="text-sm text-gray-500">Workflow not found (or not in your org).</p>}
          {wf && (
            <>
              <h1 className="text-xl font-semibold">{wf.name}</h1>
              <StepEditor
                workflowId={wf.id}
                steps={wf.steps}
                canWrite={canWrite}
                isOwner={isOwner}
                onChanged={() => refetch()}
              />
              <TriggerEditor
                workflowId={wf.id}
                triggers={wf.triggers}
                canWrite={canWrite}
                isOwner={isOwner}
                onChanged={() => refetch()}
              />
              <RunSection workflowId={wf.id} />
            </>
          )}
        </div>
      </main>
    </AuthGate>
  );
}

export default function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <WorkflowDetail id={id} />;
}
