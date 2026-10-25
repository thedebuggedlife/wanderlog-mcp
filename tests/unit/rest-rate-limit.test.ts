import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WanderlogError } from "../../src/errors.ts";
import { RestClient } from "../../src/transport/rest.ts";

describe("RestClient 429 retry", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  const client = () =>
    new RestClient({
      cookieHeader: "connect.sid=test",
      baseUrl: "https://wanderlog.test",
      wsBaseUrl: "wss://wanderlog.test",
      userAgent: "wanderdog-test",
    });

  const ok = () =>
    new Response(JSON.stringify({ success: true, user: { id: 7, username: "u" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const tooMany = (headers: Record<string, string> = {}) =>
    new Response("Too many requests", { status: 429, headers });

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("retries after a 429 and returns the eventual success", async () => {
    fetchSpy.mockResolvedValueOnce(tooMany()).mockResolvedValueOnce(ok());

    const pending = client().getUser();
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toMatchObject({ id: 7 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("backs off 2s, 4s, 8s and then fails with rate_limited", async () => {
    fetchSpy.mockImplementation(async () => tooMany());

    const pending = client().getUser();
    const settled = pending.catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(fetchSpy).toHaveBeenCalledTimes(4);

    const err = await settled;
    expect(err).toBeInstanceOf(WanderlogError);
    expect((err as WanderlogError).code).toBe("rate_limited");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("waits for a Retry-After delay given in seconds", async () => {
    fetchSpy.mockResolvedValueOnce(tooMany({ "Retry-After": "1" })).mockResolvedValueOnce(ok());

    const pending = client().getUser();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ id: 7 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caps a long Retry-After at 8s", async () => {
    fetchSpy.mockResolvedValueOnce(tooMany({ "Retry-After": "120" })).mockResolvedValueOnce(ok());

    const pending = client().getUser();
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(pending).resolves.toMatchObject({ id: 7 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
