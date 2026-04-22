# Lunch Link

Real-time collaborative group ordering. Next.js (App Router) + Supabase (Postgres / Auth / Realtime / RLS) + Tailwind.

## Architecture

- **Money**: integer cents everywhere. Floats are never used for calculations.
- **Authoritative totals**: computed by Postgres function `calculate_order_totals(p_order)`.
- **Finalization**: `finalize_order(p_order)` locks the order, computes totals, and writes a frozen snapshot into `order_allocations`. Historical orders are never recomputed.
- **Permissions**: RLS restricts reads to participants, limits item writes to the owning user, and limits fees / status / finalization to the organizer. Writes to `order_allocations` only happen via the `SECURITY DEFINER` finalize function.
- **Realtime**: the client subscribes once per `order:<id>` channel to `order_items`, `order_fees`, `order_participants`, and re-fetches authoritative totals after any change.

### Order state machine

`draft → collecting → submitted → finalized`, plus `archived` and `cancelled` side states.

## Setup

1. Create a Supabase project.
2. Run the SQL in this order (via the SQL editor):
   - `supabase/schema.sql`
   - `supabase/rls.sql`
   - `supabase/functions.sql`
3. Copy env vars:
   ```bash
   cp .env.local.example .env.local
   # fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
4. Install + run:
   ```bash
   npm install
   npm run dev
   ```

> Auth: this MVP assumes Supabase Auth is already configured. Add a sign-in route (magic link or OAuth) — all pages require an authenticated session.

## Folder structure

```
supabase/
  schema.sql         tables, enums, triggers, realtime publication
  rls.sql            row-level security policies + helpers
  functions.sql      calculate_order_totals, finalize_order
src/
  middleware.ts      Supabase SSR cookie refresh
  lib/
    money.ts         toCents / formatCents
    types.ts         shared TS types
    supabase/{server,client}.ts
  app/
    layout.tsx
    page.tsx                    home / order list
    orders/new/page.tsx         create order
    orders/[id]/page.tsx        real-time detail
    orders/[id]/organizer/page.tsx
    orders/[id]/summary/page.tsx
    actions/
      orders.ts     create / join / status
      items.ts      add / update / delete item
      fees.ts       add / delete fee
      finalize.ts   calculate + finalize (RPC wrappers)
  components/
    OrderRealtime.tsx           subscription + UI
```

## Split rules

Each fee carries its own `split`:
- `even` — divided equally across participants.
- `proportional_to_items` — divided in proportion to each participant's item subtotal. Falls back to `even` when no items exist yet.

Rounding: per-fee remainders are distributed using the largest-remainder method (fractional part desc, then `user_id` asc), so each fee's per-user shares sum exactly to the fee amount — no drift.

## Realtime subscription example

See `src/components/OrderRealtime.tsx`:

```ts
supabase
  .channel(`order:${orderId}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "order_items",
       filter: `order_id=eq.${orderId}` }, onChange)
  // ...order_fees, order_participants
  .subscribe();
```

After any event the client re-fetches `calculate_order_totals` so authoritative totals always win over optimistic UI.
