"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { formatCents } from "@/lib/money";
import type {
  Order, OrderItem, OrderFee, OrderParticipant, TotalsResult,
} from "@/lib/types";
import { addItem, deleteItem } from "@/app/actions/items";
import { addFee, deleteFee } from "@/app/actions/fees";
import { finalizeOrder } from "@/app/actions/finalize";

interface Props {
  order: Order;
  currentUserId: string;
  isOrganizer: boolean;
  initialItems: OrderItem[];
  initialFees: OrderFee[];
  initialParticipants: OrderParticipant[];
  initialTotals: TotalsResult;
}

export default function OrderRealtime({
  order, currentUserId, isOrganizer,
  initialItems, initialFees, initialParticipants, initialTotals,
}: Props) {
  const supabase = getSupabaseBrowser();
  const [items, setItems] = useState(initialItems);
  const [fees, setFees] = useState(initialFees);
  const [participants, setParticipants] = useState(initialParticipants);
  const [totals, setTotals] = useState<TotalsResult>(initialTotals);
  const [, startTransition] = useTransition();

  const refetchTotals = async () => {
    const { data } = await supabase.rpc("calculate_order_totals", { p_order: order.id });
    if (data) setTotals(data as TotalsResult);
  };

  useEffect(() => {
    const channel = supabase
      .channel(`order:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` },
        async () => {
          const { data } = await supabase.from("order_items").select("*").eq("order_id", order.id);
          if (data) setItems(data as OrderItem[]);
          refetchTotals();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_fees", filter: `order_id=eq.${order.id}` },
        async () => {
          const { data } = await supabase.from("order_fees").select("*").eq("order_id", order.id);
          if (data) setFees(data as OrderFee[]);
          refetchTotals();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_participants", filter: `order_id=eq.${order.id}` },
        async () => {
          const { data } = await supabase.from("order_participants").select("*").eq("order_id", order.id);
          if (data) setParticipants(data as OrderParticipant[]);
          refetchTotals();
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const nameOf = useMemo(() => {
    const m = new Map(participants.map(p => [p.user_id, p.display_name]));
    return (uid: string) => m.get(uid) ?? uid.slice(0, 6);
  }, [participants]);

  const itemsByUser = useMemo(() => {
    const grouped = new Map<string, OrderItem[]>();
    for (const p of participants) grouped.set(p.user_id, []);
    for (const i of items) {
      if (!grouped.has(i.user_id)) grouped.set(i.user_id, []);
      grouped.get(i.user_id)!.push(i);
    }
    return grouped;
  }, [items, participants]);

  const optimisticUserSubtotal = (uid: string) =>
    (itemsByUser.get(uid) ?? []).reduce((s, i) => s + i.qty * i.unit_price_cents, 0);

  const totalsByUser = useMemo(
    () => new Map(totals.users.map(u => [u.user_id, u])),
    [totals]
  );

  const locked = order.status === "finalized" || order.status === "cancelled";

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{order.title}</h1>
          <p className="text-xs uppercase text-neutral-500">{order.status}</p>
        </div>
        {isOrganizer && !locked && (
          <form action={async () => { await finalizeOrder(order.id); }}>
            <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white">
              Finalize order
            </button>
          </form>
        )}
      </header>

      <section className="rounded border">
        {Array.from(itemsByUser.entries()).map(([uid, userItems]) => {
          const auth = totalsByUser.get(uid);
          const optimisticSub = optimisticUserSubtotal(uid);
          return (
            <div key={uid} className="border-b p-3 last:border-b-0">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">
                  {nameOf(uid)} {uid === currentUserId && <span className="text-xs text-neutral-500">(you)</span>}
                </h3>
                <div className="text-sm">
                  <span className="text-neutral-500">items </span>
                  <span>{formatCents(optimisticSub, order.currency)}</span>
                  {auth && (
                    <>
                      <span className="mx-2 text-neutral-400">•</span>
                      <span className="text-neutral-500">total </span>
                      <span className="font-semibold">
                        {formatCents(auth.total_cents, order.currency)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <ul className="space-y-1 text-sm">
                {userItems.map(i => (
                  <li key={i.id} className="flex items-center justify-between">
                    <span>{i.qty}× {i.name}{i.notes ? ` — ${i.notes}` : ""}</span>
                    <span className="flex items-center gap-2">
                      <span>{formatCents(i.qty * i.unit_price_cents, order.currency)}</span>
                      {!locked && i.user_id === currentUserId && (
                        <button
                          onClick={() =>
                            startTransition(() => { deleteItem(i.id, order.id); })
                          }
                          className="text-xs text-red-600 hover:underline"
                        >remove</button>
                      )}
                    </span>
                  </li>
                ))}
                {userItems.length === 0 && <li className="text-xs text-neutral-500">No items yet.</li>}
              </ul>

              {!locked && uid === currentUserId && (
                <form
                  action={(fd) => addItem(order.id, fd)}
                  className="mt-3 grid grid-cols-[1fr_4rem_6rem_auto] gap-2"
                >
                  <input name="name" required placeholder="Item" className="rounded border p-1.5 text-sm" />
                  <input name="qty" type="number" min={1} defaultValue={1} className="rounded border p-1.5 text-sm" />
                  <input name="price" inputMode="decimal" placeholder="0.00" className="rounded border p-1.5 text-sm" />
                  <button className="rounded bg-black px-2 text-sm text-white">Add</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Fees</h2>
          {!isOrganizer && <span className="text-xs text-neutral-500">Organizer only</span>}
        </div>
        <ul className="mb-3 space-y-1 text-sm">
          {fees.map(f => (
            <li key={f.id} className="flex items-center justify-between">
              <span>{f.label} <span className="text-xs text-neutral-500">({f.split})</span></span>
              <span className="flex items-center gap-3">
                <span>{formatCents(f.amount_cents, order.currency)}</span>
                {isOrganizer && !locked && (
                  <button
                    onClick={() => startTransition(() => { deleteFee(f.id, order.id); })}
                    className="text-xs text-red-600 hover:underline"
                  >remove</button>
                )}
              </span>
            </li>
          ))}
          {fees.length === 0 && <li className="text-xs text-neutral-500">No fees.</li>}
        </ul>

        {isOrganizer && !locked && (
          <form
            action={(fd) => addFee(order.id, fd)}
            className="grid grid-cols-[1fr_6rem_10rem_auto] gap-2"
          >
            <input name="label" required placeholder="Tip / delivery / tax" className="rounded border p-1.5 text-sm" />
            <input name="amount" inputMode="decimal" placeholder="0.00" className="rounded border p-1.5 text-sm" />
            <select name="split" defaultValue={order.default_split_rule} className="rounded border p-1.5 text-sm">
              <option value="proportional_to_items">Proportional</option>
              <option value="even">Even</option>
            </select>
            <button className="rounded bg-black px-2 text-sm text-white">Add fee</button>
          </form>
        )}
      </section>

      <section className="rounded border p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Subtotal</span>
          <span>{formatCents(totals.grand_subtotal_cents, order.currency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Fees</span>
          <span>{formatCents(totals.grand_fees_cents, order.currency)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-1 font-semibold">
          <span>Total</span>
          <span>{formatCents(totals.grand_total_cents, order.currency)}</span>
        </div>
      </section>
    </div>
  );
}
