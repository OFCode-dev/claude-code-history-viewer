import { useMemo } from "react";
import type { BoardSessionData } from "../../types/board.types";
import type { DateFilter } from "../../types/board.types";

export interface DailyBar {
  date: string;
  sessionCount: number;
  totalTokens: number;
}

export interface ActivityData {
  dailyBars: DailyBar[];
  totalActiveDays: number;
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
}

interface DailyBucket {
  sessionCount: number;
  totalTokens: number;
}

const EMPTY_ACTIVITY: ActivityData = {
  dailyBars: [],
  totalActiveDays: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalSessions: 0,
};

/**
 * Compute the end-of-range timestamp (ms) for a date filter.
 * If `end` is at local midnight, it is treated as a date-only value
 * and the full day is included by advancing one local calendar day.
 * Otherwise 1ms is added for
 * inclusive comparison.
 */
export function getFilterEndMs(end: Date): number {
  if (
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getMilliseconds() === 0
  ) {
    const nextDay = new Date(end);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.getTime();
  }
  return end.getTime() + 1;
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  return new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Whether `b` is the calendar day right after `a` (rounded, so DST shifts do not matter). */
function isNextDay(a = "", b = ""): boolean {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 864e5) === 1;
}

function computeStreaks(dailyMap: Map<string, DailyBucket>): { current: number; longest: number } {
  if (dailyMap.size === 0) return { current: 0, longest: 0 };

  const sortedDates = Array.from(dailyMap.keys())
    .filter(d => (dailyMap.get(d)?.sessionCount ?? 0) > 0)
    .sort();

  if (sortedDates.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let currentRun = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    if (isNextDay(sortedDates[i - 1], sortedDates[i])) {
      currentRun++;
      longest = Math.max(longest, currentRun);
    } else {
      currentRun = 1;
    }
  }

  // Current streak: check if the last active day is today or yesterday
  const today = toDateString(new Date());
  const yesterday = toDateString(addDays(new Date(), -1));
  const lastActiveDate = sortedDates[sortedDates.length - 1] ?? "";

  let currentStreak = 0;
  if (lastActiveDate === today || lastActiveDate === yesterday) {
    currentStreak = 1;
    for (let i = sortedDates.length - 2; i >= 0; i--) {
      if (!isNextDay(sortedDates[i], sortedDates[i + 1])) break;
      currentStreak++;
    }
  }

  return { current: currentStreak, longest };
}

export function useActivityData(
  boardSessions: Record<string, BoardSessionData>,
  allSortedSessionIds: string[],
  dateFilter: DateFilter
): ActivityData {
  return useMemo(() => {
    if (allSortedSessionIds.length === 0) return EMPTY_ACTIVITY;

    // Step 1: Aggregate sessions by date
    const dailyMap = new Map<string, DailyBucket>();

    for (const id of allSortedSessionIds) {
      const data = boardSessions[id];
      if (!data) continue;

      const timeStr = data.session.last_message_time || data.session.last_modified;
      if (!timeStr) continue;

      const dateObj = new Date(timeStr);
      if (isNaN(dateObj.getTime())) continue;

      const date = toDateString(dateObj);
      const existing = dailyMap.get(date) || { sessionCount: 0, totalTokens: 0 };
      existing.sessionCount += 1;
      existing.totalTokens += data.stats.totalTokens;
      dailyMap.set(date, existing);
    }

    // Step 2: Determine date range
    const allDates = Array.from(dailyMap.keys()).sort();
    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];
    if (!firstDate || !lastDate) return EMPTY_ACTIVITY;
    const minDate = parseDate(firstDate);
    const maxDate = parseDate(lastDate);

    // DateFilter range, for the stats below
    const filterStartMs = dateFilter?.start ? dateFilter.start.getTime() : 0;
    const filterEndMs = dateFilter?.end
      ? getFilterEndMs(dateFilter.end)
      : Infinity;
    const hasFilter = dateFilter?.start != null || dateFilter?.end != null;

    // Build daily bars — fill every calendar day between first and last
    // active date so the time axis is proportional (gap days get sessionCount=0)
    const dailyBars: DailyBar[] = [];
    {
      let cursor = new Date(minDate);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(maxDate);
      end.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const date = toDateString(cursor);
        const bucket = dailyMap.get(date);
        dailyBars.push({
          date,
          sessionCount: bucket?.sessionCount ?? 0,
          totalTokens: bucket?.totalTokens ?? 0,
        });
        cursor = addDays(cursor, 1);
      }
    }

    // Build filtered daily map for stats (dailyBars use the full dailyMap)
    let statsMap = dailyMap;
    if (hasFilter) {
      statsMap = new Map<string, DailyBucket>();
      for (const [dateKey, bucket] of dailyMap) {
        const dayMs = parseDate(dateKey).getTime();
        if (dayMs >= filterStartMs && dayMs < filterEndMs) {
          statsMap.set(dateKey, bucket);
        }
      }
    }

    // Step 6: Compute stats from filtered map
    const { current: currentStreak, longest: longestStreak } = computeStreaks(statsMap);
    const totalActiveDays = Array.from(statsMap.values()).filter(b => b.sessionCount > 0).length;
    let filteredTotalSessions = 0;
    for (const bucket of statsMap.values()) {
      filteredTotalSessions += bucket.sessionCount;
    }

    return {
      dailyBars,
      totalActiveDays,
      currentStreak,
      longestStreak,
      totalSessions: filteredTotalSessions,
    };
  }, [boardSessions, allSortedSessionIds, dateFilter]);
}
