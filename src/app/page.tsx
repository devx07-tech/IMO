import { Header } from "@/components/recharge/Header";
import { Footer } from "@/components/recharge/Footer";
import { RechargePage } from "@/components/recharge/RechargePage";
import { RECHARGE_PACKAGES as FALLBACK_PACKAGES } from "@/lib/mock-data";
import type { RechargePackage } from "@/lib/types";

async function loadPackages(): Promise<{ packages: RechargePackage[]; isLive: boolean }> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data, error } = await supabaseAdmin
      .from("packages")
      .select("id, credits, price, active, display_order")
      .eq("active", true)
      .order("display_order", { ascending: true });

    if (error || !data) throw error ?? new Error("No package data.");

    return {
      packages: data.map((p) => ({
        id: p.id,
        credits: p.credits,
        price: Number(p.price),
        active: p.active,
        order: p.display_order,
      })),
      isLive: true,
    };
  } catch (err) {
    console.error("Falling back to demo package data:", err);
    return { packages: FALLBACK_PACKAGES, isLive: false };
  }
}

export default async function Home() {
  const { packages, isLive } = await loadPackages();

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {!isLive && (
          <p className="mb-4 rounded-input border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
            Backend not fully configured yet — showing demo package data. Add
            SUPABASE_SERVICE_ROLE_KEY to .env.local to go live.
          </p>
        )}
        <RechargePage packages={packages} />
      </main>

      <Footer />
    </>
  );
}
