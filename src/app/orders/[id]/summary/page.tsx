import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import type { Allocation, Order, OrderParticipant } from "@/lib/types";
import CopySummaryButton from "./CopySummaryButton";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: order } = await supabase.from("orders").select("*").eq("id", id).single();
  if (!order) notFound();

  const [{ data: allocations }, { data: participants }] = await Promise.all([
    supabase.from("order_allocations").select("*").eq("order_id", id),
    supabase.from("order_participants").select("*").eq("order_id", id),
  ]);

  const o = order as Order;
  const nameById = new Map(((participants ?? []) as OrderParticipant[]).map(p => [p.user_id, p.display_name]));
  const rows = ((allocations ?? []) as Allocation[]).sort(
    (a, b) => (nameById.get(a.user_id) ?? "").localeCompare(nameById.get(b.user_id) ?? "")
  );

  const lines = rows.map(r =>
    `${nameById.get(r.user_id) ?? r.user_id.slice(0, 6)}: ${formatCents(r.total_cents, o.currency)} ` +
    `(items ${formatCents(r.subtotal_cents, o.currency)} + fees ${formatCents(r.fees_cents, o.currency)})`
  );
  const grandTotal = rows.reduce((s, r) => s + r.total_cents, 0);
  const text =
    `${o.title}\n` +
    lines.join("\n") +
    `\nTotal: ${formatCents(grandTotal, o.currency)}`;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{o.title} — summary</h1>
        <p className="text-xs uppercase text-neutral-500">{o.status}</p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded border p-3 text-sm text-neutral-500">
          Order not finalized yet.{" "}
          <Link href={`/orders/${id}`} className="underline">Go back</Link>
        </p>
      ) : (
        <>
          <ul className="divide-y rounded border text-sm">
            {rows.map(r => (
              <li key={r.user_id} className="flex items-center justify-between p-3">
                <span>{nameById.get(r.user_id) ?? r.user_id.slice(0, 6)}</span>
                <span className="text-right">
                  <span className="block font-semibold">
                    {formatCents(r.total_cents, o.currency)}
                  </span>
                  <span className="text-xs text-neutral-500">
                    items {formatCents(r.subtotal_cents, o.currency)} + fees {formatCents(r.fees_cents, o.currency)}
                  </span>
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between p-3 font-semibold">
              <span>Total</span>
              <span>{formatCents(grandTotal, o.currency)}</span>
            </li>
          </ul>

          <CopySummaryButton text={text} />
        </>
      )}
    </main>
  );
}
