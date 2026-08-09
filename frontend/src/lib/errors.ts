export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const body = (err as { body?: { message?: unknown } }).body;
    if (body && typeof body.message === 'string') return body.message;
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
