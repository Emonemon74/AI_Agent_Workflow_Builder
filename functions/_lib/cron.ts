// Minimal 5-field cron matcher (minute hour day-of-month month day-of-week).
// Supports '*', exact numbers, '*/n' steps, and comma-separated lists — enough
// for the trigger UI's own examples (e.g. "*/5 * * * *") without a dependency.

function matchesField(field: string, value: number): boolean {
  return field.split(',').some((part) => {
    if (part === '*') return true;
    const step = part.match(/^\*\/(\d+)$/);
    if (step) return value % Number(step[1]) === 0;
    return Number(part) === value;
  });
}

export function matchesCron(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return (
    matchesField(minute, date.getUTCMinutes()) &&
    matchesField(hour, date.getUTCHours()) &&
    matchesField(dayOfMonth, date.getUTCDate()) &&
    matchesField(month, date.getUTCMonth() + 1) &&
    matchesField(dayOfWeek, date.getUTCDay())
  );
}

export function truncateToMinute(date: Date): number {
  return Math.floor(date.getTime() / 60000);
}
