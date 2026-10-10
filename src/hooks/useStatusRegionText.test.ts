import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutAnnouncement } from "@/store/slices/layoutSlice";
import { useStatusRegionText } from "./useStatusRegionText";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(initialStatus = "") {
  return renderHook(
    ({ status, announcement }: { status: string; announcement: LayoutAnnouncement | null }) =>
      useStatusRegionText(status, announcement),
    { initialProps: { status: initialStatus, announcement: null as LayoutAnnouncement | null } }
  );
}

describe("useStatusRegionText", () => {
  it("shows loading status, then an announcement, then stays quiet when it clears", () => {
    const { result, rerender } = setup("Loading messages");
    expect(result.current).toBe("Loading messages");

    rerender({ status: "Loading messages", announcement: { text: "Reading mode on.", id: 1 } });
    expect(result.current).toBe("Reading mode on.");

    // Cleared after a while: the old loading message must not be read again.
    rerender({ status: "Loading messages", announcement: null });
    expect(result.current).toBe("");
  });

  it("announces identical words again by emptying the region first", () => {
    const { result, rerender } = setup();
    rerender({ status: "", announcement: { text: "Prompts pinned", id: 1 } });
    expect(result.current).toBe("Prompts pinned");
    rerender({ status: "", announcement: { text: "Prompts pinned", id: 2 } });
    expect(result.current).toBe("");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe("Prompts pinned");
  });

  it("lets a new loading status take the region", () => {
    const { result, rerender } = setup();
    rerender({ status: "", announcement: { text: "Reading mode off.", id: 1 } });
    rerender({ status: "Scanning projects", announcement: { text: "Reading mode off.", id: 1 } });
    expect(result.current).toBe("Scanning projects");
  });
});
