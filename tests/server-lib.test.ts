import { describe, expect, it } from "vitest";
import { randomOrderNumber } from "@/lib/order-number";
import { memoryRateLimit } from "@/lib/rate-limit";
import { normalizeOrderNumber } from "@/lib/validation";

describe("randomOrderNumber", () => {
  it("produces lookup-compatible, unambiguous IDs", () => {
    for (let i = 0; i < 500; i++) {
      const id = randomOrderNumber();
      expect(id).toMatch(/^IMO-[0-9A-HJKMNP-TV-Z]{10}$/);
      expect(normalizeOrderNumber(id)).toBe(id);
    }
  });

  it("doesn't repeat", () => {
    const ids = new Set(Array.from({ length: 2000 }, randomOrderNumber));
    expect(ids.size).toBe(2000);
  });
});

describe("memoryRateLimit", () => {
  it("blocks after the limit within a window", () => {
    const key = `test:${Math.random()}`;
    expect(memoryRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(memoryRateLimit(key, 2, 60_000).ok).toBe(true);
    const third = memoryRateLimit(key, 2, 60_000);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });
});
