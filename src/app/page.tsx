import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: orders } = user
    ? await supabase
        .from("orders")
        .select("id,title,status,created_at")
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] as Array<{ id: string; title: string; status: string; created_at: string }> };

  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">Group lunch, no math.</h1>
        <p className="text-neutral-500">
          Start an order, share the link, everyone adds what they want. Totals computed server-side.
        </p>
      </section>

      {!user && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          You&apos;re not signed in. <Link href="/login" className="underline">Sign in</Link> to create or join an order.
        </p>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Your orders</h2>
          <Link href="/orders/new" className="rounded bg-black px-3 py-1.5 text-sm text-white">New</Link>
        </div>
        <ul className="divide-y rounded border">
          {(orders ?? []).length === 0 && (
            <li className="p-3 text-sm text-neutral-500">No orders yet.</li>
          )}
          {(orders ?? []).map((o) => (
            <li key={o.id} className="flex items-center justify-between p-3">
              <Link href={`/orders/${o.id}`} className="hover:underline">{o.title}</Link>
              <span className="text-xs uppercase text-neutral-500">{o.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
