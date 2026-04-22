-- Row Level Security policies.

alter table public.orders                enable row level security;
alter table public.order_participants    enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_fees            enable row level security;
alter table public.order_allocations     enable row level security;
alter table public.menu_snapshots        enable row level security;
alter table public.menu_snapshot_items   enable row level security;

-- Helper: is the current user a participant of :order_id ?
create or replace function public.is_participant(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.order_participants
    where order_id = p_order and user_id = auth.uid()
  );
$$;

create or replace function public.is_organizer(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.orders
    where id = p_order and organizer_id = auth.uid()
  );
$$;

-- ============ orders ============
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (public.is_participant(id));

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert with check (organizer_id = auth.uid());

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

-- ============ order_participants ============
drop policy if exists participants_select on public.order_participants;
create policy participants_select on public.order_participants
  for select using (public.is_participant(order_id));

-- A user can join themselves; organizer can insert anyone.
drop policy if exists participants_insert on public.order_participants;
create policy participants_insert on public.order_participants
  for insert with check (user_id = auth.uid() or public.is_organizer(order_id));

drop policy if exists participants_delete on public.order_participants;
create policy participants_delete on public.order_participants
  for delete using (user_id = auth.uid() or public.is_organizer(order_id));

-- ============ order_items ============
drop policy if exists items_select on public.order_items;
create policy items_select on public.order_items
  for select using (public.is_participant(order_id));

-- Users can only add/edit/delete their OWN items (user_id = auth.uid()).
drop policy if exists items_insert on public.order_items;
create policy items_insert on public.order_items
  for insert with check (
    public.is_participant(order_id)
    and user_id = auth.uid()
    and created_by = auth.uid()
  );

drop policy if exists items_update on public.order_items;
create policy items_update on public.order_items
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists items_delete on public.order_items;
create policy items_delete on public.order_items
  for delete using (user_id = auth.uid());

-- ============ order_fees ============
drop policy if exists fees_select on public.order_fees;
create policy fees_select on public.order_fees
  for select using (public.is_participant(order_id));

drop policy if exists fees_write on public.order_fees;
create policy fees_write on public.order_fees
  for all using (public.is_organizer(order_id))
  with check (public.is_organizer(order_id));

-- ============ order_allocations (read-only to participants; writes via SECURITY DEFINER fn) ============
drop policy if exists allocations_select on public.order_allocations;
create policy allocations_select on public.order_allocations
  for select using (public.is_participant(order_id));
-- No insert/update/delete policies: only the finalize_order() fn (SECURITY DEFINER) writes.

-- ============ menu_snapshots ============
drop policy if exists menu_select on public.menu_snapshots;
create policy menu_select on public.menu_snapshots
  for select using (order_id is null or public.is_participant(order_id));

drop policy if exists menu_insert on public.menu_snapshots;
create policy menu_insert on public.menu_snapshots
  for insert with check (created_by = auth.uid()
    and (order_id is null or public.is_participant(order_id)));

drop policy if exists menu_items_select on public.menu_snapshot_items;
create policy menu_items_select on public.menu_snapshot_items
  for select using (
    exists(select 1 from public.menu_snapshots s
           where s.id = snapshot_id
             and (s.order_id is null or public.is_participant(s.order_id)))
  );

drop policy if exists menu_items_insert on public.menu_snapshot_items;
create policy menu_items_insert on public.menu_snapshot_items
  for insert with check (
    exists(select 1 from public.menu_snapshots s
           where s.id = snapshot_id and s.created_by = auth.uid())
  );
