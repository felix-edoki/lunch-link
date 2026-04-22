import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import OrderRealtime from "@/components/OrderRealtime";
import { joinOrder } from "@/app/actions/orders";
import type {
  Order, OrderItem, OrderFee, OrderParticipant, TotalsResult,
} from "@/lib/types";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: order } = await supabase.from("orders").select("*").eq("id", id).single();
  if (!order) notFound();

  // Ensure the viewer is a participant (organizer auto-added via trigger).
  const { data: me } = await supabase
    .from("order_participants")
    .select("user_id")
    .eq("order_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!me) {
    return (
      <main className="space-y-3">
        <h1 className="text-xl font-semibold">{(order as Order).title}</h1>
        <p className="text-sm text-neutral-500">Join this order to add items.</p>
        <form action={async (fd) => {
          "use server";
          await joinOrder(id, String(fd.get("display_name") || ""));
        }} className="flex gap-2">
          <input name="display_name" placeholder="Your name" className="rounded border p-2 text-sm" />
          <button className="rounded bg-black px-3 text-sm text-white">Join</button>
        </form>
      </main>
    );
  }

  if ((order as Order).status === "finalized") redirect(`/orders/${id}/summary`);

  const [{ data: items }, { data: fees }, { data: participants }, { data: totals }] =
    await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", id),
      supabase.from("order_fees").select("*").eq("order_id", id),
      supabase.from("order_participants").select("*").eq("order_id", id),
      supabase.rpc("calculate_order_totals", { p_order: id }),
    ]);

  const isOrganizer = (order as Order).organizer_id === user.id;

  return (
    <main className="space-y-4">
      <OrderRealtime
        order={order as Order}
        currentUserId={user.id}
        isOrganizer={isOrganizer}
        initialItems={(items ?? []) as OrderItem[]}
        initialFees={(fees ?? []) as OrderFee[]}
        initialParticipants={(participants ?? []) as OrderParticipant[]}
        initialTotals={totals as TotalsResult}
      />
      <div className="text-xs text-neutral-500">
        <Link href={`/orders/${id}/summary`} className="hover:underline">View summary →</Link>
      </div>
    </main>
  );
}
