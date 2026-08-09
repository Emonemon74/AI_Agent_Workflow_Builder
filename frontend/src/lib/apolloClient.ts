import { ApolloClient, InMemoryCache, HttpLink, split, ApolloLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient as createWsClient } from 'graphql-ws';
import { nhost, getGraphqlUrl, getGraphqlWsUrl } from './nhostClient';

function currentAuthHeader(): Record<string, string> {
  const token = nhost.getUserSession()?.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const authLink = new ApolloLink((operation, forward) => {
  operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
    headers: { ...headers, ...currentAuthHeader() },
  }));
  return forward(operation);
});

const httpLink = new HttpLink({ uri: getGraphqlUrl() });

function makeWsLink() {
  if (typeof window === 'undefined') return null;
  return new GraphQLWsLink(
    createWsClient({
      url: getGraphqlWsUrl(),
      connectionParams: () => ({ headers: currentAuthHeader() }),
    }),
  );
}

function buildLink() {
  const wsLink = makeWsLink();
  const httpChain = authLink.concat(httpLink);
  if (!wsLink) return httpChain;
  return split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return def.kind === 'OperationDefinition' && def.operation === 'subscription';
    },
    wsLink,
    httpChain,
  );
}

export function createApolloClient() {
  return new ApolloClient({
    link: buildLink(),
    cache: new InMemoryCache(),
  });
}
