import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const db = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import("./fake-supabase").createFakeSupabase> }));
vi.mock("@/lib/supabase-admin", () => ({ get supabaseAdmin() { return db.fake.client; } }));

import { sendOrderNotification, telegramRecipients } from "@/lib/notifications/service";

const order = {
  id: "row-1", order_number: "IMO-ABCDE12345", imo_profile_id: "46523623", credits: 100, quantity: 1,
  amount: 176, customer_phone: "9876543210", payment_provider: "dghost", payment_status: "paid", recharge_status: "waiting",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.fake = createFakeSupabase();
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(() => Promise.resolve(new Response('{"ok":true}')));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Telegram recipients", () => {
  it("reads one or several comma-separated chat IDs", () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", " 1201940244 , -100555 ,");
    expect(telegramRecipients()).toEqual(["1201940244", "-100555"]);
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    expect(telegramRecipients()).toEqual([]);
  });

  it("sends a paid-order alert to every chat, with a link on the primary domain", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "111,222");
    db.fake.queue("notifications",
      { data: { id: "n1", created_at: new Date().toISOString() } },
      { data: { id: "n2", created_at: new Date().toISOString() } });
    await sendOrderNotification("order_paid", order as never);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const bodies = mocks.fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies.map((b) => b.chat_id).sort()).toEqual(["111", "222"]);
    expect(bodies[0].text).toContain("IMO ID: 46523623");
    expect(bodies[0].text).toContain("Amount paid: ₹176.00");
    expect(bodies[0].text).toContain("https://kamalseller.shop/admin/recharges");
  });
});
