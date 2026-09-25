import { appConfig } from "../../config/appConfig";
import { isValidTimeRange } from "../../logic/time";
import type { Conflict, Field, Permit } from "../../types";

/**
 * Pure helpers behind PermitCalendar. FullCalendar needs real dates, but permits are weekly
 * wall-clock slots, so the calendar is pinned to one fixed "generic" week and dates are only
 * ever translated to and from (weekday, "HH:MM") at this boundary. The calendar runs in UTC so
 * no local timezone or DST rule can shift a slot.
 */

/** Monday 1 January 2024. The week is displayed Monday-first; only weekday names are shown. */
export const GENERIC_WEEK_START = "2024-01-01";
export const GENERIC_WEEK_END = "2024-01-08";

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Display order for day lists: Mon..Sun, matching the calendar and the Excel template. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "YYYY-MM-DD" of a weekday (0=Sun..6=Sat) inside the generic week. */
export function dateForDay(day: number): string {
  return `2024-01-0${day === 0 ? 7 : day}`;
}

/** ISO string (no offset; the calendar is in UTC) for a weekday and wall-clock time. */
export function toIso(day: number, time: string): string {
  return `${dateForDay(day)}T${hhmm(time)}:00`;
}

/** Weekday and "HH:MM" of a Date produced by FullCalendar running with timeZone "UTC". */
export function fromCalendarDate(date: Date): { day: number; time: string } {
  return { day: date.getUTCDay(), time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "17:00:00" or "17:00" -> "17:00". */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

function minutes(time: string): number {
  const [h, m] = hhmm(time).split(":").map(Number);
  return h! * 60 + m!;
}

/** Keep the stored representation of the original value ("HH:MM" vs "HH:MM:SS") so string comparisons elsewhere stay consistent. */
function inFormatOf(original: string, time: string): string {
  return original.length > 5 ? `${time}:00` : time;
}

export function formatTime(time: string): string {
  const total = minutes(time);
  const h = Math.floor(total / 60); const m = total % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** "5:00-6:00 PM" when both ends share AM/PM, otherwise "11:00 AM-1:00 PM". */
export function formatTimeRange(start: string, end: string): string {
  const s = formatTime(start); const e = formatTime(end);
  return s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)}-${e}` : `${s}-${e}`;
}

/** [4, 2] -> "Tue/Thu" (Monday-first order). */
export function formatDays(days: readonly number[]): string {
  return DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join("/");
}

/** "Conflicts with Kailua Youth Soccer on Field B, Tue/Thu 5:00-6:00 PM" (SPEC 4.3). */
export function describeConflict(conflict: Conflict, fieldName: (fieldId: string | null) => string): string {
  const other = conflict.conflicts_with;
  return `Conflicts with ${other.organization} on ${fieldName(other.field_id)}, ${formatDays(conflict.shared_days)} ${formatTimeRange(other.start_time, other.end_time)}`;
}

export interface OccurrenceProps {
  permitId: string;
  /** The weekday this occurrence represents (0=Sun..6=Sat). */
  day: number;
  /** True when the permit is on a field that overlaps the selected field rather than the field itself. */
  isOtherField: boolean;
  fieldName: string;
  conflicting: boolean;
}

export interface OccurrenceEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  classNames: string[];
  extendedProps: OccurrenceProps;
}

/**
 * One calendar event per (permit, day). Shows permits on the selected field plus permits on
 * every other field in `fields`: the caller passes the selected field and the fields that
 * overlap it (SPEC 5.5). Broken permits and permits on fields not in `fields` are skipped.
 */
export function buildOccurrences(permits: readonly Permit[], fields: readonly Field[], selectedFieldId: string, conflictingPermitIds: ReadonlySet<string>): OccurrenceEvent[] {
  const names = new Map(fields.map((f) => [f.id, f.name]));
  const events: OccurrenceEvent[] = [];
  for (const permit of permits) {
    if (permit.field_id === null || !names.has(permit.field_id)) continue;
    if (!isValidTimeRange(permit.start_time, permit.end_time)) continue;
    const isOtherField = permit.field_id !== selectedFieldId;
    const conflicting = conflictingPermitIds.has(permit.id);
    for (const day of new Set(permit.days)) {
      events.push({
        id: `${permit.id}::${day}`,
        title: permit.organization,
        start: toIso(day, permit.start_time),
        end: toIso(day, permit.end_time),
        classNames: ["permit-event", conflicting ? "is-conflict" : "is-normal", ...(isOtherField ? ["is-other-field"] : [])],
        extendedProps: { permitId: permit.id, day, isOtherField, fieldName: names.get(permit.field_id)!, conflicting },
      });
    }
  }
  return events;
}

/**
 * Visible hours: the configured 5:00 AM-10:00 PM, widened to whole hours when a shown permit
 * falls outside it. Out-of-hours permits are accepted on import (SPEC 5.2), so hiding them
 * would be a silent failure.
 */
export function visibleRange(events: readonly OccurrenceEvent[]): { slotMinTime: string; slotMaxTime: string } {
  let min = appConfig.calendar.startHour * 60; let max = appConfig.calendar.endHour * 60;
  for (const e of events) {
    min = Math.min(min, minutes(e.start.slice(11)));
    max = Math.max(max, minutes(e.end.slice(11)));
  }
  const startHour = Math.floor(min / 60); const endHour = Math.min(24, Math.ceil(max / 60));
  return { slotMinTime: `${pad(startHour)}:00:00`, slotMaxTime: `${pad(endHour)}:00:00` };
}

/** Whether a dragged occurrence may land on `targetDay`: staying put is fine, landing on another day the permit already has is not. */
export function canDropOnDay(permit: Pick<Permit, "days">, fromDay: number, targetDay: number): boolean {
  return targetDay === fromDay || !permit.days.includes(targetDay);
}

export type ChangeResult =
  | { kind: "changed"; permit: Permit }
  | { kind: "unchanged" }
  | { kind: "rejected"; reason: string };

/**
 * Applies a drag or resize of the occurrence of `permit` on `fromDay` (SPEC 5.6):
 * - a new time (vertical drag or resize) applies to every day of the permit, because a permit has one time slot;
 * - a new day (horizontal drag) moves only this occurrence's day, e.g. Mon/Wed with Mon -> Tue becomes Tue/Wed;
 * - landing on a day the permit already has is rejected.
 * A diagonal drag does both. Returns a complete updated permit; nothing is saved here.
 */
export function applyOccurrenceChange(permit: Permit, fromDay: number, newStart: { day: number; time: string }, newEnd: { day: number; time: string }): ChangeResult {
  const endsAtMidnight = newEnd.time === "00:00" && newEnd.day === (newStart.day + 1) % 7;
  if (newEnd.day !== newStart.day && !endsAtMidnight) return { kind: "rejected", reason: "A permit cannot run past midnight." };
  const endTime = endsAtMidnight ? "23:59" : newEnd.time;
  if (!isValidTimeRange(newStart.time, endTime)) return { kind: "rejected", reason: "The end time must be after the start time." };
  if (!canDropOnDay(permit, fromDay, newStart.day)) {
    return { kind: "rejected", reason: `${permit.organization} already has this slot on ${DAY_LONG[newStart.day]}.` };
  }

  const start_time = inFormatOf(permit.start_time, newStart.time);
  const end_time = inFormatOf(permit.end_time, endTime);
  const days = newStart.day === fromDay ? permit.days : permit.days.map((d) => (d === fromDay ? newStart.day : d)).sort((a, b) => a - b);
  if (start_time === permit.start_time && end_time === permit.end_time && days === permit.days) return { kind: "unchanged" };
  return { kind: "changed", permit: { ...permit, start_time, end_time, days } };
}
