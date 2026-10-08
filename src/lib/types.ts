export interface RechargePackage {
  id: string;
  credits: number;
  price: number;
  active: boolean;
  order: number;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type RechargeStatus = "waiting" | "processing" | "completed" | "failed";

export interface RechargeOrder {
  id: string;
  profileId: string;
  packageLabel: string;
  credits: number;
  quantity: number;
  amount: number;
  paymentStatus: PaymentStatus;
  rechargeStatus: RechargeStatus;
  createdAt: string;
}

export type PaymentFlowState =
  | "idle"
  | "creating_order"
  | "awaiting_payment"
  | "verifying"
  | "success"
  | "failed"
  | "pending";
