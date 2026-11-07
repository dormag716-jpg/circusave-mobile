/**
 * Chat time label shown under a message.
 *
 * The server sends `createdAt` as an exact UTC time (ends in "Z") and also a
 * pre-formatted `timestamp` string that is written in the server's clock (UTC).
 * Showing that string made messages look hours off on phones in other
 * timezones. When `createdAt` is a valid time, format it on the phone so it
 * matches the phone's own clock. Otherwise fall back to the server string.
 */
export function formatChatTime(
  createdAt: string | null | undefined,
  fallback: string,
  locale?: string,
  /** Normally left out so the phone's own timezone is used. Tests set it. */
  timeZone?: string,
): string {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
        ...(timeZone ? { timeZone } : {}),
      });
    }
  }
  return fallback;
}
