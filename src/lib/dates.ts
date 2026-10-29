export const ISRAEL_TZ = "Asia/Jerusalem";

/** Minutes to add to UTC to get local time in `timeZone` at `date`. */
function offsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** "2026-11-01T10:00" entered as Israel time → the exact instant. Null if malformed. */
export function parseLocalDateTime(value: string, timeZone = ISRAEL_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes handle the hour around daylight-saving changes.
  let instant = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  instant = naive - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** An instant as a datetime-local value in Israel time. */
export function toLocalDateTimeInput(date: Date, timeZone = ISRAEL_TZ): string {
  const local = new Date(date.getTime() + offsetMinutes(date, timeZone) * 60_000);
  return local.toISOString().slice(0, 16);
}
