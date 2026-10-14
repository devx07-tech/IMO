export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type RechargeStatus = "waiting" | "processing" | "completed" | "failed";
export type NotificationChannel = "telegram" | "whatsapp";
export type NotificationStatus = "pending" | "sent" | "failed";
export type UpiEventStatus = "matched" | "unmatched" | "duplicate" | "ignored" | "dismissed";

// NOTE: these are `type` aliases, not `interface`s, on purpose — the
// Supabase client's generic constraints check each Row/Insert/Update
// against `Record<string, unknown>`, and TypeScript only accepts that
// structural check for plain object type aliases, not interfaces.
export type AdminRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
  last_login_at: string | null;
  sessions_valid_after: string;
};

export type PackageRow = {
  id: string;
  credits: number;
  price: number;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  order_number: string;
  imo_profile_id: string;
  package_id: string | null;
  credits: number;
  quantity: number;
  unit_price: number;
  amount: number;
  payment_provider: string;
  payment_status: PaymentStatus;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  recharge_status: RechargeStatus;
  admin_notes: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  updated_at: string;
  expires_at: string | null;
  customer_utr: string | null;
  customer_utr_at: string | null;
  customer_phone: string | null;
};

export type NotificationRow = {
  id: string;
  order_id: string | null;
  channel: NotificationChannel;
  event: string;
  recipient: string;
  status: NotificationStatus;
  provider_response: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
  message: string | null;
};

export type UpiPaymentEventRow = {
  id: string;
  received_at: string;
  source: string;
  raw_text: string;
  amount: number | null;
  utr: string | null;
  payer: string | null;
  status: UpiEventStatus;
  order_id: string | null;
  resolved_at: string | null;
};

export type AuditLogRow = {
  id: string;
  admin_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      admins: {
        Row: AdminRow;
        Insert: Partial<AdminRow> & Pick<AdminRow, "email" | "password_hash">;
        Update: Partial<AdminRow>;
        Relationships: [];
      };
      packages: {
        Row: PackageRow;
        Insert: Partial<PackageRow> & Pick<PackageRow, "credits" | "price">;
        Update: Partial<PackageRow>;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: Partial<OrderRow> &
          Pick<
            OrderRow,
            "order_number" | "imo_profile_id" | "credits" | "quantity" | "unit_price" | "amount"
          >;
        Update: Partial<OrderRow>;
        Relationships: [
          {
            foreignKeyName: "orders_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow> &
          Pick<NotificationRow, "channel" | "event" | "recipient">;
        Update: Partial<NotificationRow>;
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      upi_payment_events: {
        Row: UpiPaymentEventRow;
        Insert: Partial<UpiPaymentEventRow> & Pick<UpiPaymentEventRow, "source" | "raw_text" | "status">;
        Update: Partial<UpiPaymentEventRow>;
        Relationships: [
          {
            foreignKeyName: "upi_payment_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Partial<AuditLogRow> & Pick<AuditLogRow, "action" | "entity_type">;
        Update: Partial<AuditLogRow>;
        Relationships: [
          {
            foreignKeyName: "audit_logs_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "admins";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; retry_after: number }[];
      };
    };
  };
};
