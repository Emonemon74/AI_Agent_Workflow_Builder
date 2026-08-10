# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on nhost (Postgres + Hasura + Auth + Functions) with a Next.js frontend.

- **Live app:** https://frontend-eta-sand-31.vercel.app
- **Backend:** nhost Cloud project `sqtnpmfnmpgghbimnflg` (ap-south-1), auto-deploys from `main`
- **Write-up:** [WRITEUP.md](./WRITEUP.md)

## Stack

nhost (Postgres + Hasura + Auth + Storage + Functions), Hasura Actions/Event Triggers, GraphQL (queries/mutations/subscriptions), Groq for `llm_call` (OpenAI-compatible API), Next.js 15 (App Router, TypeScript, Tailwind) + Apollo Client v4.

## Test accounts (live app)

All passwords: `Password123!`

| Email | Org | Role |
|---|---|---|
| `owner-a@example.com` | Acme Robotics (Org A) | owner |
| `editor-a@example.com` | Acme Robotics (Org A) | editor |
| `viewer-a@example.com` | Acme Robotics (Org A) | viewer |
| `owner-b@example.com` | Globex Analytics (Org B) | owner |

Org A has one seeded workflow, **"Support Ticket Triage"** (all 6 step types + a webhook trigger). See the final scenario walkthrough in [WRITEUP.md](./WRITEUP.md).

## Repo layout

```
nhost/            nhost.toml, SQL migrations, exported Hasura metadata (tables, relationships, permissions, actions, event triggers)
functions/        Hasura Action handlers + Event Trigger handlers (Node/TypeScript), the workflow engine in functions/_lib/
frontend/         Next.js app
scripts/          Hasura CLI wrapper + raw metadata JSON used to (re)apply permissions/actions/event triggers
```

## Running it locally

### Prerequisites

- Docker (for the local nhost stack)
- Node 22+, npm
- [nhost CLI](https://docs.nhost.io/getting-started/local-development/cli) (`npm install -g nhost` or the install script linked there)

### 1. Start the backend

```bash
cd nhost/..              # repo root
nhost up
```

This starts Postgres, Hasura, Auth, Storage, and Functions in Docker, applies the migrations in `nhost/migrations`, and applies the metadata in `nhost/metadata`. First run takes a few minutes (pulling images).

Local endpoints (printed at the end of `nhost up`):
- Hasura console: `https://local.hasura.local.nhost.run/console`
- Hasura GraphQL: `https://local.hasura.local.nhost.run/v1/graphql` (note: the `graphql.*` subdomain 404s on this local setup — always use `hasura.*`)
- Auth: `https://local.auth.local.nhost.run`
- Functions: `https://local.functions.local.nhost.run`

The local admin secret and other generated secrets live in `.secrets` at the repo root (created by `nhost init`, gitignored). `scripts/hasura.sh` is a thin wrapper around the Hasura CLI with the local connection flags pre-filled, e.g.:

```bash
./scripts/hasura.sh migrate status --database-name default
```

### 2. API keys / secrets

Add these to the repo-root `.secrets` file (gitignored) — see `.env.example` for the full list and how the templating in `nhost/nhost.toml` (`{{ secrets.X }}`) wires them into the Functions runtime:

- `GROQ_API_KEY` — from [console.groq.com/keys](https://console.groq.com/keys). **If left empty, `llm_call` falls back to a disclosed stub**: a fake ~800ms delay and a canned response with `output.stubbed = true`, so the rest of the pipeline (retries, quota, etc.) still exercises real code paths.
- `SLACK_WEBHOOK_URL` — optional. If unset (or not a real URL), the `notify` step's Event Trigger handler logs the message via `console.log` instead of posting to Slack (also disclosed, see `functions/sendNotification.ts`).
- `FUNCTIONS_BASE_URL` — already set to `http://functions:3000` for local dev; don't change this one. (On Cloud it's set to the public Functions URL instead — see [WRITEUP.md](./WRITEUP.md) for why this needs to differ per environment.)

After editing `.secrets`, restart the stack (`nhost down && nhost up`) so Functions/Hasura pick up the change.

### 3. Start the frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_NHOST_SUBDOMAIN=local, NEXT_PUBLIC_NHOST_REGION=local
npm run dev
```

Open http://localhost:3000.

### 4. Seed data

The schema ships with no seed data (organizations/users are meant to be created through real sign-up + admin-secret-backed membership assignment, not a self-serve API — see [WRITEUP.md](./WRITEUP.md) for why). To recreate the two-org demo scenario locally:

1. Sign up a few users via the app's sign-up page (or `POST /v1/signup/email-password` to the local Auth URL).
2. Using the Hasura console (authenticated with the admin secret from `.secrets`), insert `organizations` and `org_members` rows to assign roles — see `scripts/metadata/` for the shape, or copy the pattern from the seeding calls described in WRITEUP.md.

## Deploying your own copy

- **Backend:** create an nhost Cloud project, `nhost link` this repo to it, connect the repo under Settings → Deployments → Connect to GitHub (base directory `/`, branch `main`), then set `GROQ_API_KEY` and `FUNCTIONS_BASE_URL` (to `https://<subdomain>.functions.<region>.nhost.run/v1`) via `nhost secrets create` or the dashboard.
- **Frontend:** `vercel link` inside `frontend/`, set `NEXT_PUBLIC_NHOST_SUBDOMAIN` / `NEXT_PUBLIC_NHOST_REGION` as production env vars, `vercel deploy --prod`.

## Step types

`llm_call`, `http_request`, `db_write`, `notify` (via Event Trigger), `conditional_branch`, `approval_gate` — see [WRITEUP.md](./WRITEUP.md) for how each is implemented.

## Trigger types

`manual` (frontend Run button → `triggerWorkflowRun` Action), `webhook` (public `triggerWorkflowRunWebhook` Action, secret-gated, no user JWT), `event` (Hasura Event Trigger on `trigger_events` insert), `scheduled` (defined in the schema/config but not wired to a cron function in this build — lowest priority per the assignment's "at least one non-manual trigger" bar, which webhook + event both already clear).
