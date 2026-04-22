-- Authoritative server-side calculation + finalization.
-- All arithmetic in integer cents. Per-fee rounding remainders are distributed with
-- the largest-remainder method (fractional part desc, then user_id asc) so per-user
-- fee shares always sum to the exact fee amount. No floats are used anywhere.

create or replace function public.calculate_order_totals(p_order uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_default_rule split_rule;
  v_n_users int;
  v_grand_sub bigint;
  v_result jsonb;
begin
  if not public.is_participant(p_order) then
    raise exception 'not a participant';
  end if;

  select default_split_rule into v_default_rule from public.orders where id = p_order;

  -- Subtotals per participant.
  create temp table _subs on commit drop as
    select p.user_id,
           coalesce(sum(i.qty * i.unit_price_cents), 0)::bigint as subtotal_cents
      from public.order_participants p
      left join public.order_items i
             on i.order_id = p.order_id and i.user_id = p.user_id
     where p.order_id = p_order
     group by p.user_id;

  select count(*), coalesce(sum(subtotal_cents),0) into v_n_users, v_grand_sub from _subs;

  -- Per-fee, per-user base share + remainder rank.
  create temp table _fee_shares on commit drop as
  with fees as (
    select id, amount_cents::bigint as amount, split
      from public.order_fees where order_id = p_order
  ),
  base as (
    select f.id as fee_id, s.user_id, f.amount, f.split, s.subtotal_cents,
           case
             when v_n_users = 0 then 0
             when f.split = 'even' then f.amount / v_n_users
             when f.split = 'proportional_to_items' and v_grand_sub > 0
                  then (f.amount * s.subtotal_cents) / v_grand_sub
             else f.amount / greatest(v_n_users,1)   -- fallback: even when no items
           end::bigint as base_share,
           case
             when v_n_users = 0 then 0
             when f.split = 'even' then f.amount - (f.amount / v_n_users) * v_n_users
             when f.split = 'proportional_to_items' and v_grand_sub > 0
                  then (f.amount * s.subtotal_cents) - ((f.amount * s.subtotal_cents) / v_grand_sub) * v_grand_sub
             else f.amount - (f.amount / greatest(v_n_users,1)) * greatest(v_n_users,1)
           end::bigint as frac_num
      from fees f cross join _subs s
  ),
  ranked as (
    select b.*,
           row_number() over (partition by fee_id order by frac_num desc, user_id) as rn,
           -- total remainder to distribute per fee = amount - sum(base_share)
           (b.amount - sum(base_share) over (partition by fee_id))::bigint as rem_total
      from base b
  )
  select fee_id, user_id,
         (base_share + case when rn <= rem_total then 1 else 0 end)::bigint as share
    from ranked;

  -- Aggregate per-user fees.
  with per_user_fees as (
    select user_id, coalesce(sum(share),0)::bigint as fees_cents from _fee_shares group by user_id
  ),
  per_user as (
    select s.user_id,
           s.subtotal_cents,
           coalesce(f.fees_cents,0) as fees_cents,
           (s.subtotal_cents + coalesce(f.fees_cents,0))::bigint as total_cents
      from _subs s
      left join per_user_fees f on f.user_id = s.user_id
  )
  select jsonb_build_object(
           'order_id', p_order,
           'default_split_rule', v_default_rule,
           'users', coalesce(jsonb_agg(
             jsonb_build_object(
               'user_id', user_id,
               'subtotal_cents', subtotal_cents,
               'fees_cents', fees_cents,
               'total_cents', total_cents
             ) order by user_id
           ), '[]'::jsonb),
           'grand_subtotal_cents', coalesce(sum(subtotal_cents),0),
           'grand_fees_cents',     coalesce(sum(fees_cents),0),
           'grand_total_cents',    coalesce(sum(total_cents),0)
         )
    into v_result
    from per_user;

  return v_result;
end $$;


create or replace function public.finalize_order(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer uuid;
  v_status    order_status;
  v_totals    jsonb;
  v_user      jsonb;
begin
  select organizer_id, status into v_organizer, v_status
    from public.orders where id = p_order for update;

  if v_organizer is null then raise exception 'order not found'; end if;
  if v_organizer <> auth.uid() then raise exception 'only organizer can finalize'; end if;
  if v_status = 'finalized' then raise exception 'order already finalized'; end if;
  if v_status = 'cancelled' then raise exception 'order is cancelled'; end if;

  v_totals := public.calculate_order_totals(p_order);

  delete from public.order_allocations where order_id = p_order;

  for v_user in select * from jsonb_array_elements(v_totals->'users')
  loop
    insert into public.order_allocations
      (order_id, user_id, subtotal_cents, fees_cents, total_cents, breakdown)
    values (
      p_order,
      (v_user->>'user_id')::uuid,
      (v_user->>'subtotal_cents')::int,
      (v_user->>'fees_cents')::int,
      (v_user->>'total_cents')::int,
      v_user
    );
  end loop;

  update public.orders
     set status = 'finalized',
         finalized_at = now(),
         finalized_by = auth.uid()
   where id = p_order;

  return v_totals;
end $$;

grant execute on function public.calculate_order_totals(uuid) to authenticated;
grant execute on function public.finalize_order(uuid)         to authenticated;
