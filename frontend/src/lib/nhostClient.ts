import { createClient } from '@nhost/nhost-js';

export const nhost = createClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local',
  region: process.env.NEXT_PUBLIC_NHOST_REGION || 'local',
});

export function getGraphqlUrl(): string {
  // createClient builds https://<subdomain>.graphql.<region>.nhost.run/v1 for cloud,
  // and the *.local.nhost.run convention for local dev when subdomain/region === 'local'.
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';
  if (subdomain === 'local') {
    // Locally, the graphql.* subdomain 404s on this stack; hasura.* serves /v1/graphql directly.
    return 'https://local.hasura.local.nhost.run/v1/graphql';
  }
  return `https://${subdomain}.graphql.${region}.nhost.run/v1/graphql`;
}

export function getGraphqlWsUrl(): string {
  return getGraphqlUrl().replace(/^https/, 'wss');
}
