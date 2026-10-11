import { describe, it, expect } from "vitest";

import { shouldCheckForUpdates } from "../utils/updateSettings";
import { DEFAULT_UPDATE_SETTINGS } from "../types/updateSettings";

describe("shouldCheckForUpdates", () => {
  const now = 1_700_000_000_000;
  const base = {
    ...DEFAULT_UPDATE_SETTINGS,
    autoCheck: true,
    checkInterval: "startup" as const,
  };

  it("should return false when autoCheck is disabled", () => {
    expect(
      shouldCheckForUpdates({ settings: { ...base, autoCheck: false }, now, online: true })
    ).toBe(false);
  });

  it("should return false when checkInterval is never", () => {
    expect(
      shouldCheckForUpdates({ settings: { ...base, checkInterval: "never" }, now, online: true })
    ).toBe(false);
  });

  it("should return true for startup interval", () => {
    expect(shouldCheckForUpdates({ settings: base, now, online: true })).toBe(true);
  });

  it("should return false when within postpone interval", () => {
    expect(
      shouldCheckForUpdates({
        settings: { ...base, lastPostponedAt: now, postponeInterval: 24 * 60 * 60 * 1000 },
        now,
        online: true,
      })
    ).toBe(false);
  });

  it("should return true when postpone interval has passed", () => {
    expect(
      shouldCheckForUpdates({
        settings: {
          ...base,
          lastPostponedAt: now - 25 * 60 * 60 * 1000,
          postponeInterval: 24 * 60 * 60 * 1000,
        },
        now,
        online: true,
      })
    ).toBe(true);
  });

  it("should return false for daily interval within 24 hours of last check", () => {
    expect(
      shouldCheckForUpdates({
        settings: { ...base, checkInterval: "daily", lastCheckedAt: now - 12 * 60 * 60 * 1000 },
        now,
        online: true,
      })
    ).toBe(false);
  });

  it("should return true for daily interval after 24 hours of last check", () => {
    expect(
      shouldCheckForUpdates({
        settings: { ...base, checkInterval: "daily", lastCheckedAt: now - 25 * 60 * 60 * 1000 },
        now,
        online: true,
      })
    ).toBe(true);
  });

  it("should return false for weekly interval within 7 days of last check", () => {
    expect(
      shouldCheckForUpdates({
        settings: { ...base, checkInterval: "weekly", lastCheckedAt: now - 2 * 24 * 60 * 60 * 1000 },
        now,
        online: true,
      })
    ).toBe(false);
  });

  it("should return true for weekly interval after 7 days of last check", () => {
    expect(
      shouldCheckForUpdates({
        settings: { ...base, checkInterval: "weekly", lastCheckedAt: now - 8 * 24 * 60 * 60 * 1000 },
        now,
        online: true,
      })
    ).toBe(true);
  });

  it("should return false when offline and offline mode should be respected", () => {
    expect(
      shouldCheckForUpdates({
        settings: { ...base, respectOfflineStatus: true },
        now,
        online: false,
      })
    ).toBe(false);
  });
});
