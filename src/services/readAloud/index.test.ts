import { describe, expect, it, vi } from "vitest";

describe("readAloud entry point", () => {
  it("exposes the controller handle without touching speechSynthesis at import", async () => {
    const getter = vi.fn();
    Object.defineProperty(window, "speechSynthesis", { configurable: true, get: getter });

    const { readAloudHandle } = await import("./index");

    expect(getter).not.toHaveBeenCalled();
    expect(readAloudHandle.getSnapshot()).toMatchObject({ status: "off" });
    for (const method of [
      "start",
      "stop",
      "setSource",
      "skipToLatest",
      "poke",
      "onVisible",
      "setPrefs",
      "subscribe",
      "getSnapshot",
      "prime",
      "probe",
      "getAvailability",
      "subscribeAvailability",
    ] as const) {
      expect(typeof readAloudHandle[method]).toBe("function");
    }
    expect(readAloudHandle.getAvailability().availability).toBe("unknown");

    Reflect.deleteProperty(window, "speechSynthesis");
  });
});
