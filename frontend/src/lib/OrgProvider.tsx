'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useAuth } from './AuthProvider';

export type OrgRole = 'owner' | 'editor' | 'viewer';

interface OrgMembership {
  role: OrgRole;
  organization: { id: string; name: string };
}

const MY_ORGS = gql`
  query MyOrgs($userId: uuid!) {
    org_members(where: { user_id: { _eq: $userId } }) {
      role
      organization {
        id
        name
      }
    }
  }
`;

interface OrgContextValue {
  memberships: OrgMembership[];
  loading: boolean;
  currentOrgId: string | null;
  currentRole: OrgRole | null;
  setCurrentOrgId: (id: string) => void;
  refetchOrgs: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { userId, isAuthenticated } = useAuth();
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<{ org_members: OrgMembership[] }>(MY_ORGS, {
    variables: { userId },
    skip: !isAuthenticated || !userId,
    fetchPolicy: 'cache-and-network',
  });

  const memberships = useMemo(() => data?.org_members ?? [], [data]);

  useEffect(() => {
    if (!currentOrgId && memberships.length > 0) {
      setCurrentOrgId(memberships[0].organization.id);
    }
  }, [memberships, currentOrgId]);

  const currentRole = memberships.find((m) => m.organization.id === currentOrgId)?.role ?? null;

  const value = useMemo<OrgContextValue>(
    () => ({
      memberships,
      loading,
      currentOrgId,
      currentRole,
      setCurrentOrgId,
      refetchOrgs: () => refetch(),
    }),
    [memberships, loading, currentOrgId, currentRole, refetch],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
