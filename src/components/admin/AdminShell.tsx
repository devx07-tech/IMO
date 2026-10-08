"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Menu,
  PackageSearch,
  Bell,
  RefreshCcw,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ListOrdered },
  { href: "/admin/recharges", label: "Recharge Queue", icon: RefreshCcw },
  { href: "/admin/packages", label: "Packages", icon: PackageSearch },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
];

function isNavActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent-soft text-accent"
                : "text-foreground/80 hover:bg-background hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ adminEmail, children }: { adminEmail: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
          <div className="mb-6 px-1">
            <p className="text-base font-bold text-foreground">IMO Recharge</p>
            <p className="text-xs text-muted">Admin console</p>
          </div>
          <NavLinks pathname={pathname} />
          <div className="mt-auto border-t border-border pt-3">
            <p className="truncate px-1 text-xs text-muted">{adminEmail}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex w-full items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error-soft"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-input text-foreground"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="text-sm font-bold text-foreground">IMO Recharge Admin</p>
            <div className="w-9" />
          </header>

          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-surface p-4 shadow-card">
            <div className="mb-6 flex items-center justify-between px-1">
              <div>
                <p className="text-base font-bold text-foreground">IMO Recharge</p>
                <p className="text-xs text-muted">Admin console</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-input text-muted"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto border-t border-border pt-3">
              <p className="truncate px-1 text-xs text-muted">{adminEmail}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 flex w-full items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error-soft"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
