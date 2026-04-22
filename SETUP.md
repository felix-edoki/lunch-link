# Lunch Link — Setup Guide

Follow in order. Each step has a **Test** — don't move on until it passes.

---

## Step 1 — Install dependencies

```bash
cd C:/Repos/lunch-link
npm install
```

**Test:** `npm run typecheck` completes with no errors.

---

## Step 2 — Create a Supabase project

1. https://supabase.com/dashboard → **New project**
2. Save the DB password, pick closest region, wait ~2 min.

**Test:** **Settings → API** shows `Project URL`, `anon` key, `service_role` key.

---

## Step 3 — Environment variables

```bash
cp .env.local.example .env.local
```

Fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

**Test:** `.env.local` exists and values are pasted.

---

## Step 4 — Run SQL (in order)

In **SQL Editor → New query**, run each as a separate query:

### 4a. `supabase/schema.sql`
**Test:** **Table Editor** shows 7 tables: `orders`, `order_participants`, `order_items`, `order_fees`, `order_allocations`, `menu_snapshots`, `menu_snapshot_items`.

### 4b. `supabase/rls.sql`
**Test:**
```sql
select tablename, rowsecurity from pg_tables where schemaname='public';
```
All 7 tables show `rowsecurity = true`.

### 4c. `supabase/functions.sql`
**Test:**
```sql
select proname from pg_proc
where proname in ('calculate_order_totals','finalize_order','is_participant','is_organizer');
```
Expect 4 rows.

---

## Step 5 — Configure Supabase Auth

1. **Authentication → Providers → Email** → enable Email. For local dev, turn **off** "Confirm email".
2. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`

**Test:** settings saved. (Sign-in tested in Step 6.)

---

## Step 6 — Run dev server + sign in

```bash
npm run dev
```

Open http://localhost:3000.

**Test checklist:**
1. Home loads with "not signed in" banner.
2. **Sign in** → enter email → **Send magic link**.
3. Magic link arrives (or grab one from **Auth → Users → ⋯ → Send magic link**).
4. Clicking it lands you on `/` with no banner.
5. **Auth → Users** shows your row.

---

## Step 7 — End-to-end smoke test

1. **Create order** "Test lunch" → lands on `/orders/<id>`.
   - DB: `select * from orders;` shows it; `select role from order_participants;` → `organizer`.
2. **Add item** "Pad Thai" qty 1 price `14.50`.
   - Totals show $14.50. DB: `unit_price_cents = 1450`.
3. **Add fee** "Tip" amount `3.00` split Proportional.
   - Total becomes $17.50.
4. **Realtime:** open same URL in incognito as a second user, join, add an item. First window should update within ~1s.
5. **Finalize** → redirected to summary; **Copy summary** works.
   - DB: `order_allocations` has one row per participant; `orders.status = 'finalized'`.

---

## Step 8 — RLS sanity check

In a second browser (different user who hasn't joined), visit `/orders/<id>`. The page should offer "Join this order" and show no items until they join.
