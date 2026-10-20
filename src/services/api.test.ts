import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  getApiBase: vi.fn(() => ""),
  getAuthToken: vi.fn<() => string | null>(() => null),
  getCsrfToken: vi.fn<() => string | null>(() => null),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
  clearAuthCookie: vi.fn(async () => {}),
}));
vi.mock("@/utils/platform", () => platform);

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { api, AuthRequiredError } from "./api";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api()", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const replace = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    replace.mockReset();
    invoke.mockReset();
    platform.isTauri.mockReturnValue(false);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { search: "", pathname: "/", replace },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("forwards an AbortSignal to fetch and stays backward compatible without one", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { ok: 1 }));
    const controller = new AbortController();

    await expect(api("cmd", { a: 1 }, { signal: controller.signal })).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);

    await expect(api("cmd")).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeUndefined();
  });

  it("throws AuthRequiredError after redirecting on a terminal 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "nope" }));

    const error = await api("cmd").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthRequiredError);
    expect(error).toBeInstanceOf(Error);
    expect(replace).toHaveBeenCalledWith("/?auth_error=1");
  });

  it("throws AuthRequiredError without redirecting when already on the auth error page", async () => {
    window.location.search = "?auth_error=1";
    fetchMock.mockResolvedValue(jsonResponse(401, {}));

    await expect(api("cmd")).rejects.toBeInstanceOf(AuthRequiredError);
    expect(replace).not.toHaveBeenCalled();
  });

  it("throws AuthRequiredError when the retried request is still unauthorized", async () => {
    window.location.search = "?token=abc";
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: "bad token" }));

    const error = await api("cmd").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthRequiredError);
    expect((error as Error).message).toBe("bad token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps plain Errors for other failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));

    const error = await api("cmd").catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(AuthRequiredError);
    expect((error as Error).message).toBe("boom");
  });

  it("rejects a desktop invoke when the signal aborts", async () => {
    platform.isTauri.mockReturnValue(true);
    invoke.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();

    const pending = api("cmd", {}, { signal: controller.signal });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes a desktop invoke result through when not aborted", async () => {
    platform.isTauri.mockReturnValue(true);
    invoke.mockResolvedValue(42);

    await expect(api("cmd", { x: 1 }, { signal: new AbortController().signal })).resolves.toBe(42);
    expect(invoke).toHaveBeenCalledWith("cmd", { x: 1 });
  });
});
