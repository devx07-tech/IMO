import { Header } from "@/components/recharge/Header";
import { Footer } from "@/components/recharge/Footer";
import { RechargePage } from "@/components/recharge/RechargePage";
import { RECHARGE_PACKAGES as DEMO_PACKAGES } from "@/lib/mock-data";
import type { RechargePackage } from "@/lib/types";

// Rebuild the price list at most once a minute; admin package edits also
// trigger an immediate revalidatePath("/").
export const revalidate = 60;

type PackageLoad =
  | { status: "live"; packages: RechargePackage[] }
  | { status: "demo"; packages: RechargePackage[] }
  | { status: "unavailable"; packages: RechargePackage[] };

async function loadPackages(): Promise<PackageLoad> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data, error } = await supabaseAdmin
      .from("packages")
      .select("id, credits, price, active, display_order")
      .eq("active", true)
      .order("display_order", { ascending: true });

    if (error || !data) throw error ?? new Error("No package data.");

    return {
      status: "live",
      packages: data.map((p) => ({
        id: p.id,
        credits: p.credits,
        price: Number(p.price),
        active: p.active,
        order: p.display_order,
      })),
    };
  } catch (err) {
    console.error("Failed to load packages:", err);
    // Never show demo prices (with fake package IDs) to real customers.
    return process.env.NODE_ENV === "production"
      ? { status: "unavailable", packages: [] }
      : { status: "demo", packages: DEMO_PACKAGES };
  }
}

export default async function Home() {
  const { status, packages } = await loadPackages();

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {status === "demo" && (
          <p className="mb-4 rounded-input border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
            Backend not fully configured yet — showing demo package data. Add
            SUPABASE_SERVICE_ROLE_KEY to .env.local to go live.
          </p>
        )}
        {status === "unavailable" && (
          <p
            role="alert"
            className="mb-4 rounded-input border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning"
          >
            Recharge packages are temporarily unavailable. Please try again in a
            few minutes, or contact support below.
          </p>
        )}
        <RechargePage packages={packages} />
      </main>

      <Footer />
    </>
  );
}
