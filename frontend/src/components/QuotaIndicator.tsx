'use client';

import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useOrg } from '@/lib/OrgProvider';

const ORG_USAGE = gql`
  query OrgUsage($orgId: uuid!) {
    org_usage_current_period(where: { org_id: { _eq: $orgId } }) {
      quota_used
      quota_limit
      runs_this_month
      avg_run_duration_seconds
    }
  }
`;

interface Usage {
  quota_used: number;
  quota_limit: number;
  runs_this_month: number;
  avg_run_duration_seconds: number | null;
}

export function QuotaIndicator() {
  const { currentOrgId } = useOrg();
  const { data, loading } = useQuery<{ org_usage_current_period: Usage[] }>(ORG_USAGE, {
    variables: { orgId: currentOrgId },
    skip: !currentOrgId,
    pollInterval: 10000,
  });

  if (loading || !data?.org_usage_current_period?.[0]) return null;
  const usage = data.org_usage_current_period[0];
  const pct = usage.quota_limit > 0 ? Math.min(100, Math.round((usage.quota_used / usage.quota_limit) * 100)) : 0;

  return (
    <div className="flex items-center gap-3 rounded border p-3 text-sm">
      <span className="font-medium">Quota:</span>
      <span>
        {usage.quota_used} / {usage.quota_limit} calls used this period
      </span>
      <div className="h-2 w-32 overflow-hidden rounded bg-gray-200">
        <div
          className={`h-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-gray-500">
        {usage.runs_this_month} run{usage.runs_this_month === 1 ? '' : 's'} this month
        {usage.avg_run_duration_seconds != null && ` · avg ${usage.avg_run_duration_seconds.toFixed(1)}s`}
      </span>
    </div>
  );
}
