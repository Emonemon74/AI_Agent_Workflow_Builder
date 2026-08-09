export function getByPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

// Replaces {{previous}} or {{previous.some.path}} in a string with data from the
// previous step's output, so later steps can reference earlier results.
export function interpolate(template: string, previous: unknown): string {
  return template.replace(/\{\{\s*previous(?:\.([\w.]+))?\s*\}\}/g, (_match, path?: string) => {
    const value = path ? getByPath(previous, path) : previous;
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 500,
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
