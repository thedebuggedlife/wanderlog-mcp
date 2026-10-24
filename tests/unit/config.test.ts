import { describe, expect, it } from "vitest";
import { loadConfig, normalizeCookie } from "../../src/config.ts";
import { WanderlogValidationError } from "../../src/errors.ts";

describe("normalizeCookie", () => {
  it("wraps a bare s%3A... value in connect.sid=", () => {
    const result = normalizeCookie("s%3AabcDEF123.signature");
    expect(result).toBe("connect.sid=s%3AabcDEF123.signature");
  });

  it("wraps a bare s: value (unencoded) in connect.sid=", () => {
    const result = normalizeCookie("s:abcDEF123.signature");
    expect(result).toBe("connect.sid=s:abcDEF123.signature");
  });

  it("passes through a full connect.sid=... value", () => {
    const input = "connect.sid=s%3AabcDEF123.signature";
    expect(normalizeCookie(input)).toBe(input);
  });

  it("passes through a multi-cookie header", () => {
    const input = "connect.sid=s%3AabcDEF123.signature; other=value";
    expect(normalizeCookie(input)).toBe(input);
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeCookie("  s%3Axyz.sig  ")).toBe("connect.sid=s%3Axyz.sig");
  });

  it("rejects empty strings", () => {
    expect(() => normalizeCookie("")).toThrow(WanderlogValidationError);
    expect(() => normalizeCookie("   ")).toThrow(WanderlogValidationError);
  });

  it("rejects values that don't look like connect.sid cookies", () => {
    expect(() => normalizeCookie("random garbage")).toThrow(WanderlogValidationError);
    expect(() => normalizeCookie("jwt=eyJhbGci...")).toThrow(WanderlogValidationError);
  });

  it.each([
    ["LF", "s%3ASECRETVALUE.part1\npart2"],
    ["CR", "s%3ASECRETVALUE.part1\rpart2"],
    ["NUL", "s%3ASECRETVALUE.part1\0part2"],
    ["tab", "s%3ASECRETVALUE.part1\tpart2"],
    ["DEL", "s%3ASECRETVALUE.part1\x7fpart2"],
    ["non-ASCII", "s%3ASECRETVALUE.part1\u00e9part2"],
    ["prefixed with connect.sid=", "connect.sid=s%3ASECRETVALUE.part1\npart2"],
  ])("rejects a cookie containing %s without echoing it", (_label, raw) => {
    let caught: unknown;
    try {
      normalizeCookie(raw);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WanderlogValidationError);
    const message = (caught as WanderlogValidationError).toUserMessage();
    expect(message).not.toContain("SECRETVALUE");
    expect(message).not.toContain("part1");
    expect(message).not.toContain("part2");
  });
});

describe("loadConfig", () => {
  it("loads with WANDERLOG_COOKIE set", () => {
    const config = loadConfig({
      WANDERLOG_COOKIE: "s%3Atest.signature",
    } as NodeJS.ProcessEnv);

    expect(config.cookieHeader).toBe("connect.sid=s%3Atest.signature");
    expect(config.baseUrl).toBe("https://wanderlog.com");
    expect(config.wsBaseUrl).toBe("wss://wanderlog.com");
    expect(config.userAgent).toContain("Mozilla");
  });

  it("throws actionable error when WANDERLOG_COOKIE is missing", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(WanderlogValidationError);
  });

  it("rejects a multi-line cookie without echoing it", () => {
    const env = { WANDERLOG_COOKIE: "s%3ASECRETVALUE.part1\npart2" } as NodeJS.ProcessEnv;
    expect(() => loadConfig(env)).toThrow(WanderlogValidationError);
    expect(() => loadConfig(env)).not.toThrow(/SECRETVALUE|part1|part2/);
  });

  it("allows base URL override", () => {
    const config = loadConfig({
      WANDERLOG_COOKIE: "s%3Atest.sig",
      WANDERLOG_BASE_URL: "https://staging.wanderlog.com",
    } as NodeJS.ProcessEnv);

    expect(config.baseUrl).toBe("https://staging.wanderlog.com");
  });
});
