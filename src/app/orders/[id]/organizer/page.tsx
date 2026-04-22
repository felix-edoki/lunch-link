import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { toCents, formatCents } from "@/lib/money";
import { addFee, deleteFee } from "@/app/actions/fees";
import { finalizeOrder } from "@/app/actions/finalize";
import { setOrderStatus } from "@/app/actions/orders";
import type { Order, OrderFee } from "@/lib/types";

async function importMenu(orderId: string, formData: FormData) {
  "use server";
  const raw = String(formData.get("menu") || "");
  if (!raw.trim()) return;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: snap, error: e1 } = await supabase
    .from("menu_snapshots")
    .insert({ order_id: orderId, source: "paste", raw_text: raw, created_by: user.id })
    .select("id").single();
  if (e1) throw new Error(e1.message);

  // Simple parser: lines like "Name  $12.50" or "Name - 12.50"
  const rows = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)[\s\-:]+\$?([\d]+(?:\.\d{1,2})?)\s*$/);
    if (!m) return null;
    return { name: m[1].trim(), price_cents: toCents(m[2]) };
  }).filter(Boolean) as Array<{ name: string; price_cents: number }>;

  if (rows.length) {
    const { error: e2 } = await supabase.from("menu_snapshot_items").insert(
      rows.map(r => ({ snapshot_id: snap!.id, name: r.name, price_cents: r.price_cents }))
    );
    if (e2) throw new Error(e2.message);
  }
}

export default async function OrganizerPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: order } = await supabase.from("orders").select("*").eq("id", id).single();
  if (!order) notFound();
  if ((order as Order).organizer_id !== user.id) redirect(`/orders/${id}`);

  const { data: fees } = await supabase.from("order_fees").select("*").eq("order_id", id);

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{(order as Order).title} — organizer</h1>
          <p className="text-xs uppercase text-neutral-500">{(order as Order).status}</p>
        </div>
        <Link href={`/orders/${id}`} className="text-sm underline">Back to order</Link>
      </header>

      <section className="rounded border p-3">
        <h2 className="mb-2 font-semibold">Fees</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {((fees ?? []) as OrderFee[]).map(f => (
            <li key={f.id} className="flex items-center justify-between">
              <span>{f.label} <span className="text-xs text-neutral-500">({f.split})</span></span>
              <span className="flex items-center gap-3">
                <span>{formatCents(f.amount_cents, (order as Order).currency)}</span>
                <form action={async () => { "use server"; await deleteFee(f.id, id); }}>
                  <button className="text-xs text-red-600 hover:underline">remove</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
        <form action={(fd) => addFee(id, fd)} className="grid grid-cols-[1fr_6rem_10rem_auto] gap-2">
          <input name="label" required placeholder="Tip / delivery / tax" className="rounded border p-1.5 text-sm" />
          <input name="amount" inputMode="decimal" placeholder="0.00" className="rounded border p-1.5 text-sm" />
          <select name="split" defaultValue="proportional_to_items" className="rounded border p-1.5 text-sm">
            <option value="proportional_to_items">Proportional</option>
            <option value="even">Even</option>
          </select>
          <button className="rounded bg-black px-2 text-sm text-white">Add</button>
        </form>
      </section>

      <section className="rounded border p-3">
        <h2 className="mb-2 font-semibold">Paste menu</h2>
        <p className="mb-2 text-xs text-neutral-500">
          One item per line, e.g. <code>Pad Thai - 14.50</code>. Non-matching lines are ignored.
        </p>
        <form action={(fd) => importMenu(id, fd)} className="space-y-2">
          <textarea name="menu" rows={6} className="w-full rounded border p-2 text-sm" />
          <button className="rounded bg-black px-3 py-1.5 text-sm text-white">Save menu snapshot</button>
        </form>
      </section>

      <section className="flex flex-wrap gap-2">
        <form action={async () => { "use server"; await setOrderStatus(id, "submitted"); }}>
          <button className="rounded border px-3 py-1.5 text-sm">Mark submitted</button>
        </form>
        <form action={async () => { "use server"; await setOrderStatus(id, "cancelled"); }}>
          <button className="rounded border px-3 py-1.5 text-sm text-red-600">Cancel</button>
        </form>
        <form action={async () => { "use server"; await finalizeOrder(id); }}>
          <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white">Finalize</button>
        </form>
      </section>
    </main>
  );
}
