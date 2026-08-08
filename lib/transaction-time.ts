// Resolves the (occurredAt, year, month) trio for a Transaction row from
// whatever date/time the classifier extracted (or didn't).
//
// Calendar dates/times throughout this app are stored as Date.UTC(year,
// month-1, day, hour, minute) — see the "Timezone Fix (UTC)" note in
// CLAUDE.md — so an AI-supplied wall-clock value (Bangkok time) is read back
// with the same UTC getters, at face value, with no timezone conversion. The
// only place a real conversion is needed is the fallback: `new Date()` is a
// UTC instant, and Thailand is UTC+7 with no DST, so "today" in Bangkok can
// be a different UTC calendar day than `new Date().getUTCDate()` would say
// (e.g. 1am Bangkok is still "yesterday" in UTC) — shift by the fixed offset
// before reading the calendar fields.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

// Fallback hour for a date that got shifted to the past/future (e.g.
// "เมื่อวาน") but came with no time-of-day — the classifier prompt is told to
// use this same fixed hour in that case, since "current time" isn't a
// meaningful default for a day other than today. This is mostly a backstop
// for when the model's output doesn't fully conform (see the "yesterday"
// echoed-back-unparsed incident this file's log documents); for today, both
// the prompt and the fallback below use the actual current time instead.
const DEFAULT_HOUR = 8;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TZ_DESIGNATOR = /(Z|[+-]\d{2}:?\d{2})$/;

function bangkokNowParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const shifted = new Date(Date.now() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// The model is asked for "YYYY-MM-DDTHH:00:00" (no zone) meaning Bangkok
// wall-clock time. `new Date()` treats a date-time string with no zone as
// *local* time (unlike a bare date, which it treats as UTC) — on a
// non-UTC host that would silently shift the hour. Pin it to UTC explicitly
// so the numbers are always read back at face value, per the convention
// above.
function normalizeAiDateTime(raw: string): string {
  if (DATE_ONLY.test(raw)) {
    const now = bangkokNowParts();
    const isToday = raw === `${now.year}-${pad(now.month)}-${pad(now.day)}`;
    const hour = isToday ? now.hour : DEFAULT_HOUR;
    const minute = isToday ? now.minute : 0;
    return `${raw}T${pad(hour)}:${pad(minute)}:00Z`;
  }
  return HAS_TZ_DESIGNATOR.test(raw) ? raw : `${raw}Z`;
}

// "Today" in Bangkok as YYYY-MM-DD, for handing the AI classifier a concrete
// anchor date so it can resolve relative phrases ("เมื่อวาน", "มะรืนนี้")
// into real ISO dates itself instead of echoing the phrase back unparsed.
export function bangkokTodayISODate(): string {
  const { year, month, day } = bangkokNowParts();
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Current Bangkok wall-clock date+time, handed to the AI classifier as the
// "ตอนนี้" anchor so occurredAt's time-of-day can default to the actual
// current time when the message doesn't mention a date or time at all
// (e.g. "ข้าวเที่ยง 50"), instead of a fixed guess like "always morning".
export function bangkokNowISODateTime(): string {
  const { year, month, day, hour, minute } = bangkokNowParts();
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

export interface ResolvedOccurredAt {
  occurredAt: Date;
  year: number;
  month: number;
}

export function resolveOccurredAt(aiDateTime: string | null): ResolvedOccurredAt {
  if (aiDateTime) {
    const parsed = new Date(normalizeAiDateTime(aiDateTime));
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getUTCFullYear();
      const month = parsed.getUTCMonth() + 1;
      const day = parsed.getUTCDate();
      const hour = parsed.getUTCHours();
      const minute = parsed.getUTCMinutes();
      return { occurredAt: new Date(Date.UTC(year, month - 1, day, hour, minute)), year, month };
    }
  }
  // No occurredAt at all (AI omitted it entirely) — treat like "today, no
  // time specified" and use the actual current time, same as the prompt's
  // default for that case.
  const { year, month, day, hour, minute } = bangkokNowParts();
  return { occurredAt: new Date(Date.UTC(year, month - 1, day, hour, minute)), year, month };
}
