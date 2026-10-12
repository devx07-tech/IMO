import { describe, expect, it } from "vitest";
import {
  getClientIp,
  normalizeOrderNumber,
  parseIntParam,
  safeAdminRedirect,
  sanitizeSearch,
} from "@/lib/validation";

describe("normalizeOrderNumber", () => {
  it("accepts new and legacy formats, case-insensitively", () => {
    expect(normalizeOrderNumber(" imo-7k3m9q2xrb ")).toBe("IMO-7K3M9Q2XRB");
    expect(normalizeOrderNumber("IMO-10241")).toBe("IMO-10241");
  });

  it("rejects LIKE wildcards and malformed input", () => {
    for (const bad of ["IMO-%", "IMO-1%", "IMO-_____", "%", "IMO-", "10241", "IMO-12 34", "", null]) {
      expect(normalizeOrderNumber(bad)).toBeNull();
    }
  });
});

describe("safeAdminRedirect", () => {
  it("allows admin paths", () => {
    expect(safeAdminRedirect("/admin/orders")).toBe("/admin/orders");
  });

  it("blocks open redirects", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/admin\\@evil.com",
      "javascript:alert(1)",
      "/",
      null,
    ]) {
      expect(safeAdminRedirect(bad)).toBe("/admin");
    }
  });
});

describe("sanitizeSearch", () => {
  it("strips PostgREST filter syntax and LIKE wildcards", () => {
    expect(sanitizeSearch("IMO-123,payment_status.eq.paid")).toBe("IMO-123paymentstatuseqpaid");
    expect(sanitizeSearch("%_()*")).toBe("");
  });

  it("caps length", () => {
    expect(sanitizeSearch("1".repeat(100))).toHaveLength(40);
  });
});

describe("parseIntParam", () => {
  it("falls back on junk and clamps to max", () => {
    expect(parseIntParam("abc", 50, 100)).toBe(50);
    expect(parseIntParam("-5", 0, 100)).toBe(0);
    expect(parseIntParam("1000", 50, 100)).toBe(100);
    expect(parseIntParam(null, 7, 100)).toBe(7);
  });
});

describe("getClientIp", () => {
  it("prefers x-real-ip over a spoofable x-forwarded-for", () => {
    const headers = new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" });
    expect(getClientIp(headers)).toBe("1.1.1.1");
  });

  it("falls back to the first forwarded hop", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
