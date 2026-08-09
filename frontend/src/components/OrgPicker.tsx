'use client';

import { useAuth } from '@/lib/AuthProvider';
import { useOrg } from '@/lib/OrgProvider';

export function OrgPicker() {
  const { memberships, currentOrgId, setCurrentOrgId, currentRole } = useOrg();
  const { email, signOut } = useAuth();

  return (
    <div className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-3">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={currentOrgId ?? ''}
          onChange={(e) => setCurrentOrgId(e.target.value)}
        >
          {memberships.length === 0 && <option value="">No organizations</option>}
          {memberships.map((m) => (
            <option key={m.organization.id} value={m.organization.id}>
              {m.organization.name}
            </option>
          ))}
        </select>
        {currentRole && (
          <span className="rounded bg-gray-100 px-2 py-1 text-xs uppercase text-gray-600">{currentRole}</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>{email}</span>
        <button onClick={() => signOut()} className="underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
