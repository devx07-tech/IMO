import type { NotificationChannel } from "../db-types";

export interface ProviderSendResult {
  ok: boolean;
  providerResponse: string;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  send(params: { recipient: string; message: string }): Promise<ProviderSendResult>;
}

export type NotificationEvent = "order_paid" | "recharge_completed";
