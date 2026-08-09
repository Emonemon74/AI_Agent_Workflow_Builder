import { adminGraphQL } from './hasura';

export type OrgRole = 'owner' | 'editor' | 'viewer';

export async function getOrgRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const data = await adminGraphQL<{ org_members: { role: OrgRole }[] }>(
    `query ($orgId: uuid!, $userId: uuid!) {
      org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }, limit: 1) {
        role
      }
    }`,
    { orgId, userId },
  );
  return data.org_members[0]?.role ?? null;
}

export async function getWorkflowOrgId(workflowId: string): Promise<string | null> {
  const data = await adminGraphQL<{ workflows_by_pk: { org_id: string } | null }>(
    `query ($id: uuid!) {
      workflows_by_pk(id: $id) { org_id }
    }`,
    { id: workflowId },
  );
  return data.workflows_by_pk?.org_id ?? null;
}

export async function getOrgQuota(orgId: string): Promise<{ quota_used: number; quota_limit: number } | null> {
  const data = await adminGraphQL<{ organizations_by_pk: { quota_used: number; quota_limit: number } | null }>(
    `query ($id: uuid!) {
      organizations_by_pk(id: $id) { quota_used quota_limit }
    }`,
    { id: orgId },
  );
  return data.organizations_by_pk ?? null;
}

// Hasura Action session_variables keys are lowercased, e.g. "x-hasura-user-id".
export function getSessionUserId(sessionVariables: Record<string, string> | undefined): string | null {
  return sessionVariables?.['x-hasura-user-id'] ?? null;
}
