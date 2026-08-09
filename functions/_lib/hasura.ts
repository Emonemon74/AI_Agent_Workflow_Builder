// Admin GraphQL client for function handlers. Uses the internal docker-network
// hostname when available (local dev) and falls back to the public GraphQL URL
// (nhost Cloud), since Cloud functions can resolve that DNS directly while the
// local Docker network can't route *.local.nhost.run back to itself.
const HASURA_URL =
  process.env.HASURA_GRAPHQL_GRAPHQL_URL ||
  process.env.NHOST_GRAPHQL_URL ||
  'http://graphql:8080/v1/graphql';

const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

export class GraphQLError extends Error {
  errors: unknown;
  constructor(errors: unknown) {
    super('GraphQL request failed');
    this.errors = errors;
  }
}

export async function adminGraphQL<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) {
    throw new GraphQLError(json.errors);
  }
  return json.data as T;
}
