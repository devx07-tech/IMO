import "server-only";
import { supabaseAdmin } from "./supabase-admin";

export type AuditAction =
  | "admin_login"
  | "admin_login_failed"
  | "admin_logout"
  | "recharge_started"
  | "recharge_completed"
  | "recharge_failed"
  | "recharge_reopened"
  | "package_created"
  | "package_updated"
  | "package_activated"
  | "package_disabled"
  | "notification_retried"
  | "order_note_updated";

interface LogAuditParams {
  adminId?: string | null;
  action: AuditAction;
  entityType: "order" | "package" | "notification" | "admin";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit({
  adminId = null,
  action,
  entityType,
  entityId = null,
  metadata,
}: LogAuditParams): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error("Failed to write audit log", { action, entityType, entityId, error });
  }
}
