import "server-only";
import type { NotificationProvider, ProviderSendResult } from "./types";

export class TelegramProvider implements NotificationProvider {
  channel = "telegram" as const;

  async send({ recipient, message }: { recipient: string; message: string }): Promise<ProviderSendResult> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return { ok: false, providerResponse: "TELEGRAM_BOT_TOKEN is not configured." };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          chat_id: recipient,
          // Plain text on purpose: no parse_mode means order data can never be
          // interpreted as Telegram HTML/Markdown markup.
          text: message,
        }),
      });

      const body = await res.text();

      if (!res.ok) {
        return { ok: false, providerResponse: `HTTP ${res.status}: ${body.slice(0, 500)}` };
      }

      return { ok: true, providerResponse: body.slice(0, 500) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Telegram send error";
      return { ok: false, providerResponse: message };
    }
  }
}
