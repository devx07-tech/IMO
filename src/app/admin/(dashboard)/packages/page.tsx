"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Plus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { PackageRow } from "@/lib/db-types";

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    fetch("/api/admin/packages")
      .then((res) => res.json())
      .then((body) => setPackages(body.packages ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (pkg: PackageRow) => {
    await fetch(`/api/admin/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !pkg.active }),
    });
    setLoading(true);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Packages</h1>
          <p className="text-sm text-muted">Manage recharge credit tiers and pricing.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 rounded-button bg-accent px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Package
        </button>
      </div>

      {showCreate && (
        <CreatePackageForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="rounded-card bg-surface shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Credits</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Display Order</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) =>
                  editingId === pkg.id ? (
                    <EditPackageRow
                      key={pkg.id}
                      pkg={pkg}
                      onDone={() => {
                        setEditingId(null);
                        load();
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={pkg.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {pkg.credits.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-foreground">{formatCurrency(pkg.price)}</td>
                      <td className="px-4 py-3 text-muted">{pkg.display_order}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            pkg.active ? "bg-success-soft text-success" : "bg-border/60 text-muted"
                          )}
                        >
                          {pkg.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(pkg.id)}
                            className="text-xs font-semibold text-accent hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(pkg)}
                            className="text-xs font-semibold text-muted hover:text-foreground"
                          >
                            {pkg.active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CreatePackageForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [credits, setCredits] = useState("");
  const [price, setPrice] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/admin/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credits: Number(credits),
        price: Number(price),
        displayOrder: Number(displayOrder),
        active: true,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create package.");
      setSubmitting(false);
      return;
    }

    onCreated();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4 shadow-card"
    >
      <Field label="Credits">
        <input
          type="number"
          required
          min={1}
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          className="w-28 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Price (₹)">
        <input
          type="number"
          required
          min={0.01}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-28 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Display Order">
        <input
          type="number"
          min={0}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          className="w-24 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
      </Field>

      {error && <p className="text-xs font-medium text-error">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-button bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
        >
          {submitting ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-button border border-border-strong px-3.5 py-2 text-sm font-medium text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditPackageRow({
  pkg,
  onDone,
  onCancel,
}: {
  pkg: PackageRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [credits, setCredits] = useState(String(pkg.credits));
  const [price, setPrice] = useState(String(pkg.price));
  const [displayOrder, setDisplayOrder] = useState(String(pkg.display_order));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/admin/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credits: Number(credits),
        price: Number(price),
        displayOrder: Number(displayOrder),
      }),
    });
    setSaving(false);
    onDone();
  };

  return (
    <tr className="border-b border-border bg-accent-soft/40 last:border-0">
      <td className="px-4 py-2.5">
        <input
          type="number"
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          className="w-24 rounded-input border border-border-strong bg-surface px-2 py-1.5 text-sm"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-input border border-border-strong bg-surface px-2 py-1.5 text-sm"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          className="w-20 rounded-input border border-border-strong bg-surface px-2 py-1.5 text-sm"
        />
      </td>
      <td className="px-4 py-2.5 text-xs text-muted">—</td>
      <td className="px-4 py-2.5">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-xs font-semibold text-accent hover:underline disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onCancel} className="text-xs font-semibold text-muted">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs font-medium text-muted">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
