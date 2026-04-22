-- Lunch Link schema. All money is integer cents.
-- Run in Supabase SQL editor. Requires auth schema (built-in).

create extension if not exists "pgcrypto";

-- ============ ENUMS ============
do $$ begin
  create type order_status as enum ('draft','collecting','submitted','finalized','archived','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type split_rule as enum ('even','proportional_to_items');
exception when duplicate_object then null; end $$;

-- ============ ORDERS ============
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  organizer_id    uuid not null references auth.users(id) on delete restrict,
  title           text not null,
  currency        text not null default 'CAD',
  status          order_status not null default 'collecting',
  default_split_rule split_rule not null default 'proportional_to_items',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finalized_at    timestamptz,
  finalized_by    uuid references auth.users(id),
  cancelled_at    timestamptz
);

create index if not exists orders_organizer_idx on public.orders(organizer_id);
create index if not exists orders_status_idx    on public.orders(status);

-- ============ PARTICIPANTS ============
create table if not exists public.order_participants (
  order_id     uuid not null references public.orders(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'member' check (role in ('organizer','member')),
  joined_at    timestamptz not null default now(),
  primary key (order_id, user_id)
);

create index if not exists participants_user_idx on public.order_participants(user_id);

-- ============ ITEMS ============
create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade, -- eater
  created_by       uuid not null references auth.users(id),                   -- actor
  name             text not null,
  qty              int  not null default 1 check (qty > 0),
  unit_price_cents int  not null check (unit_price_cents >= 0),
  notes            text,
  menu_snapshot_item_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists items_order_idx on public.order_items(order_id);
create index if not exists items_user_idx  on public.order_items(order_id, user_id);

-- ============ FEES ============
create table if not exists public.order_fees (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  label        text not null,
  amount_cents int  not null check (amount_cents >= 0),
  split        split_rule not null default 'proportional_to_items',
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists fees_order_idx on public.order_fees(order_id);

-- ============ ALLOCATIONS (frozen at finalization) ============
create table if not exists public.order_allocations (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  subtotal_cents int not null,
  fees_cents     int not null,
  total_cents    int not null,
  breakdown      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (order_id, user_id)
);

-- ============ MENU SNAPSHOTS ============
create table if not exists public.menu_snapshots (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete set null,
  source      text not null default 'manual', -- 'manual' | 'paste'
  raw_text    text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.menu_snapshot_items (
  id           uuid primary key default gen_random_uuid(),
  snapshot_id  uuid not null references public.menu_snapshots(id) on delete cascade,
  section      text,
  name         text not null,
  price_cents  int not null check (price_cents >= 0)
);

-- ============ TRIGGERS: updated_at ============
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ begin
  create trigger orders_touch before update on public.orders
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger items_touch before update on public.order_items
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger fees_touch before update on public.order_fees
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- Auto-add organizer as participant on order insert
create or replace function public.add_organizer_as_participant() returns trigger
language plpgsql security definer as $$
begin
  insert into public.order_participants (order_id, user_id, display_name, role)
  values (new.id, new.organizer_id,
          coalesce((select raw_user_meta_data->>'name' from auth.users where id = new.organizer_id), 'Organizer'),
          'organizer')
  on conflict do nothing;
  return new;
end $$;

do $$ begin
  create trigger orders_add_organizer after insert on public.orders
    for each row execute function public.add_organizer_as_participant();
exception when duplicate_object then null; end $$;

-- Realtime publication
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.order_fees;
alter publication supabase_realtime add table public.order_participants;
alter publication supabase_realtime add table public.order_allocations;
