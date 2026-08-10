import type { Request, Response } from 'express';
import { adminGraphQL } from './_lib/hasura';

// nhost's secrets vault requires a non-empty value, so an unconfigured deployment
// stores a placeholder here rather than a real URL - only treat it as configured
// if it actually looks like a webhook URL.
const rawSlackUrl = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_WEBHOOK_URL = rawSlackUrl.startsWith('http') ? rawSlackUrl : '';

// Hasura Event Trigger webhook, fired on INSERT into public.notifications.
// This is how the `notify` step type is implemented "as an Event Trigger"
// rather than the workflow engine sending the alert directly.
export default async (req: Request, res: Response) => {
  const newRow = req.body?.event?.data?.new;
  const id: string | undefined = newRow?.id;
  const message: string | undefined = newRow?.message;

  if (!id || !message) {
    return res.status(200).json({ skipped: true });
  }

  if (SLACK_WEBHOOK_URL) {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } else {
    // Disclosed stub path — no SLACK_WEBHOOK_URL configured (see README).
    console.log(`[notify:stub] ${message}`);
  }

  await adminGraphQL(
    `mutation ($id: uuid!, $sentAt: timestamptz!) {
      update_notifications_by_pk(pk_columns: { id: $id }, _set: { sent_at: $sentAt }) { id }
    }`,
    { id, sentAt: new Date().toISOString() },
  );

  return res.status(200).json({ sent: Boolean(SLACK_WEBHOOK_URL) });
};
