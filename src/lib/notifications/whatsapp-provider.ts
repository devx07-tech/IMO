import "server-only";
import type { NotificationProvider, ProviderSendResult } from "./types";

/**
 * Placeholder extension point. No real WhatsApp send path exists yet.
 * Wire this to an approved WhatsApp Business API provider when ready —
 * never browser automation, and never a fake/simulated send.
 */
export class FutureWhatsAppProvider implements NotificationProvider {
  channel = "whatsapp" as const;

  async send(): Promise<ProviderSendResult> {
    return {
      ok: false,
      providerResponse: "WhatsApp provider is not implemented yet.",
    };
  }
}
