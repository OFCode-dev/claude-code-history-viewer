/**
 * useActivityData Hook Tests
 * 
 * Tests for the activity timeline data aggregation hook, covering:
 * - DST boundaries
 * - Single-day filters
 * - Empty data
 * - Streak calculations
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActivityData } from "../components/SessionBoard/useActivityData";
import type { BoardSessionData } from "../types/board.types";
import type { DateFilter } from "../types/board.types";

// Helper to create mock session data
function createMockSession(
  id: string,
  lastMessageTime: string,
  totalTokens: number = 100
): BoardSessionData {
  return {
    session: {
      id,
      title: `Session ${id}`,
      last_message_time: lastMessageTime,
      last_modified: lastMessageTime,
      metadata: {},
    },
    stats: {
      totalTokens,
      inputTokens: totalTokens / 2,
      outputTokens: totalTokens / 2,
      messageCount: 1,
    },
  } as BoardSessionData;
}

describe("useActivityData", () => {
  describe("empty data handling", () => {
    it("should return empty data structure when no sessions", () => {
      const { result } = renderHook(() =>
        useActivityData({}, [], { start: null, end: null })
      );

      expect(result.current.dailyBars).toEqual([]);
      expect(result.current.totalActiveDays).toBe(0);
      expect(result.current.currentStreak).toBe(0);
      expect(result.current.longestStreak).toBe(0);
      expect(result.current.totalSessions).toBe(0);
    });

    it("should handle sessions without timestamps", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": {
          session: {
            id: "1",
            title: "Session 1",
            last_message_time: "",
            last_modified: "",
            metadata: {},
          },
          stats: {
            totalTokens: 100,
            inputTokens: 50,
            outputTokens: 50,
            messageCount: 1,
          },
        } as BoardSessionData,
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1"], { start: null, end: null })
      );

      // Sessions without valid timestamps should result in empty data
      expect(result.current.totalActiveDays).toBe(0);
      expect(result.current.totalSessions).toBe(0);
    });
  });

  describe("daily aggregation", () => {
    it("should aggregate multiple sessions on same day", () => {
      // Use local-time strings (no Z suffix) so toDateString() always
      // resolves to the same local date regardless of the runner's timezone.
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00", 100),
        "2": createMockSession("2", "2024-01-15T14:00:00", 150),
        "3": createMockSession("3", "2024-01-15T18:00:00", 200),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      expect(result.current.totalActiveDays).toBe(1);
      expect(result.current.totalSessions).toBe(3);
      
      const dailyBar = result.current.dailyBars[0];
      expect(dailyBar?.sessionCount).toBe(3);
      expect(dailyBar?.totalTokens).toBe(450);
    });

    it("should separate sessions on different days", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00", 100),
        "2": createMockSession("2", "2024-01-16T10:00:00", 150),
        "3": createMockSession("3", "2024-01-17T10:00:00", 200),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      expect(result.current.totalActiveDays).toBe(3);
      expect(result.current.dailyBars).toHaveLength(3);
    });
  });

  describe("streak calculations", () => {
    it("should calculate consecutive day streaks", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00"),
        "2": createMockSession("2", "2024-01-16T10:00:00"),
        "3": createMockSession("3", "2024-01-17T10:00:00"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      expect(result.current.longestStreak).toBe(3);
    });

    it("should break streak on gap day", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00"),
        "2": createMockSession("2", "2024-01-16T10:00:00"),
        "3": createMockSession("3", "2024-01-18T10:00:00"), // Gap: Jan 17 missing
        "4": createMockSession("4", "2024-01-19T10:00:00"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3", "4"], { start: null, end: null })
      );

      expect(result.current.longestStreak).toBe(2);
    });

    it("should calculate current streak ending today", () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", twoDaysAgo.toISOString()),
        "2": createMockSession("2", yesterday.toISOString()),
        "3": createMockSession("3", today.toISOString()),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      expect(result.current.currentStreak).toBe(3);
    });

    it("should calculate current streak ending yesterday", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", twoDaysAgo.toISOString()),
        "2": createMockSession("2", yesterday.toISOString()),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2"], { start: null, end: null })
      );

      expect(result.current.currentStreak).toBe(2);
    });

    it("should reset current streak if last activity is older", () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", fourDaysAgo.toISOString()),
        "2": createMockSession("2", threeDaysAgo.toISOString()),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2"], { start: null, end: null })
      );

      expect(result.current.currentStreak).toBe(0);
    });
  });

  describe("DST boundary handling", () => {
    it("should handle DST spring forward (2024-03-10 in US)", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-03-09T10:00:00"),
        "2": createMockSession("2", "2024-03-10T10:00:00"), // DST boundary
        "3": createMockSession("3", "2024-03-11T10:00:00"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      // Should still treat as 3 consecutive days
      expect(result.current.longestStreak).toBe(3);
      expect(result.current.totalActiveDays).toBe(3);
    });

    it("should handle DST fall back (2024-11-03 in US)", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-11-02T10:00:00"),
        "2": createMockSession("2", "2024-11-03T10:00:00"), // DST boundary
        "3": createMockSession("3", "2024-11-04T10:00:00"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      // Should still treat as 3 consecutive days
      expect(result.current.longestStreak).toBe(3);
      expect(result.current.totalActiveDays).toBe(3);
    });
  });

  describe("dailyBars output", () => {
    it("should sort dailyBars by date", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-17T10:00:00"),
        "2": createMockSession("2", "2024-01-15T10:00:00"),
        "3": createMockSession("3", "2024-01-16T10:00:00"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      const dates = result.current.dailyBars.map(b => b.date);
      expect(dates).toEqual(["2024-01-15", "2024-01-16", "2024-01-17"]);
    });

    it("should include all data in dailyBars", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00", 100),
        "2": createMockSession("2", "2024-01-15T14:00:00", 200),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2"], { start: null, end: null })
      );

      const bar = result.current.dailyBars[0];
      expect(bar?.date).toBe("2024-01-15");
      expect(bar?.sessionCount).toBe(2);
      expect(bar?.totalTokens).toBe(300);
    });
  });

  describe("filtered stats with dateFilter", () => {
    it("should filter totalActiveDays and totalSessions by dateFilter range", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00", 100),
        "2": createMockSession("2", "2024-01-16T10:00:00", 150),
        "3": createMockSession("3", "2024-01-17T10:00:00", 200),
      };

      const dateFilter: DateFilter = {
        start: new Date("2024-01-16T00:00:00"),
        end: new Date("2024-01-16T23:59:59.999"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], dateFilter)
      );

      // Only Jan 16 is in the filter range
      expect(result.current.totalActiveDays).toBe(1);
      expect(result.current.totalSessions).toBe(1);
    });

    it("should filter streak calculations by dateFilter range", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00"),
        "2": createMockSession("2", "2024-01-16T10:00:00"),
        "3": createMockSession("3", "2024-01-17T10:00:00"),
        "4": createMockSession("4", "2024-01-19T10:00:00"), // gap
        "5": createMockSession("5", "2024-01-20T10:00:00"),
      };

      // Filter to only Jan 15-17 (3 consecutive days)
      const dateFilter: DateFilter = {
        start: new Date("2024-01-15T00:00:00"),
        end: new Date("2024-01-17T23:59:59.999"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3", "4", "5"], dateFilter)
      );

      expect(result.current.longestStreak).toBe(3);
      expect(result.current.totalActiveDays).toBe(3);
      expect(result.current.totalSessions).toBe(3);
    });

    it("should return zero stats when dateFilter excludes all sessions", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00"),
        "2": createMockSession("2", "2024-01-16T10:00:00"),
      };

      // Filter to a date with no sessions
      const dateFilter: DateFilter = {
        start: new Date("2024-02-01T00:00:00"),
        end: new Date("2024-02-01T23:59:59.999"),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2"], dateFilter)
      );

      expect(result.current.totalActiveDays).toBe(0);
      expect(result.current.totalSessions).toBe(0);
      expect(result.current.currentStreak).toBe(0);
      expect(result.current.longestStreak).toBe(0);
    });

    it("should show full stats when dateFilter is cleared", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00", 100),
        "2": createMockSession("2", "2024-01-16T10:00:00", 200),
        "3": createMockSession("3", "2024-01-17T10:00:00", 300),
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], { start: null, end: null })
      );

      expect(result.current.totalActiveDays).toBe(3);
      expect(result.current.totalSessions).toBe(3);
    });

    it("should handle start-only dateFilter", () => {
      const sessions: Record<string, BoardSessionData> = {
        "1": createMockSession("1", "2024-01-15T10:00:00"),
        "2": createMockSession("2", "2024-01-16T10:00:00"),
        "3": createMockSession("3", "2024-01-17T10:00:00"),
      };

      const dateFilter: DateFilter = {
        start: new Date("2024-01-16T00:00:00"),
        end: null,
      };

      const { result } = renderHook(() =>
        useActivityData(sessions, ["1", "2", "3"], dateFilter)
      );

      // Jan 16 and 17 should be included
      expect(result.current.totalActiveDays).toBe(2);
      expect(result.current.totalSessions).toBe(2);
    });
  });
});
