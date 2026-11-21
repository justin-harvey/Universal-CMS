// Date/time formatting for the public pages (M2).
//
// Event times are stored as ISO strings and must be READ in the organisation's
// timezone (site.config.ts `timezone`), not the build server's. Everything here
// is pure and runs at build time — no runtime JS ships to the page.
import { site } from "@config";

const tz = site.timezone || "America/New_York";

/** "Saturday, March 8, 2025" */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  }).format(d);
}

/** "6:30 PM" */
export function formatTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
}

/**
 * "Saturday, March 8, 2025 · 6:30 – 8:00 PM" for an event with a start (and
 * optional end on the same day), or just the start otherwise. Timezone-aware.
 */
export function formatEventWhen(startsAt: string, endsAt?: string): string {
  const date = formatDate(startsAt);
  const start = formatTime(startsAt);
  if (!date) return "";
  if (!start) return date;
  if (endsAt) {
    const end = formatTime(endsAt);
    // If end falls on the same calendar day, show a time range; otherwise two full dates.
    if (end && formatDate(endsAt) === date) return `${date} · ${start} – ${end}`;
    if (end) return `${date} · ${start} – ${formatDate(endsAt)} ${end}`;
  }
  return `${date} · ${start}`;
}

/** True once an event's start is in the past (compared at build time). */
export function isPast(iso: string): boolean {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/** True if an announcement's expiry has passed (so it should drop off). */
export function isExpired(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
