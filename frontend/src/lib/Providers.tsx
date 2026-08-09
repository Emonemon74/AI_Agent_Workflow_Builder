'use client';

import { useState } from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { createApolloClient } from './apolloClient';
import { AuthProvider } from './AuthProvider';
import { OrgProvider } from './OrgProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createApolloClient());

  return (
    <AuthProvider>
      <ApolloProvider client={client}>
        <OrgProvider>{children}</OrgProvider>
      </ApolloProvider>
    </AuthProvider>
  );
}
