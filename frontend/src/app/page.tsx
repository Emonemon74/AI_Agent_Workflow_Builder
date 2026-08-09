'use client';

import { AuthGate } from '@/components/AuthGate';
import { OrgPicker } from '@/components/OrgPicker';
import { QuotaIndicator } from '@/components/QuotaIndicator';
import { WorkflowList } from '@/components/WorkflowList';

export default function DashboardPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl">
        <OrgPicker />
        <div className="flex flex-col gap-6 p-6">
          <QuotaIndicator />
          <WorkflowList />
        </div>
      </main>
    </AuthGate>
  );
}
