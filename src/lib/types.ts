export type OrderStatus =
  | "draft" | "collecting" | "submitted" | "finalized" | "archived" | "cancelled";

export type SplitRule = "even" | "proportional_to_items";

export interface Order {
  id: string;
  organizer_id: string;
  title: string;
  currency: string;
  status: OrderStatus;
  default_split_rule: SplitRule;
  notes: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  cancelled_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  user_id: string;
  created_by: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderFee {
  id: string;
  order_id: string;
  label: string;
  amount_cents: number;
  split: SplitRule;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OrderParticipant {
  order_id: string;
  user_id: string;
  display_name: string;
  role: "organizer" | "member";
  joined_at: string;
}

export interface Allocation {
  id: string;
  order_id: string;
  user_id: string;
  subtotal_cents: number;
  fees_cents: number;
  total_cents: number;
  breakdown: Record<string, unknown>;
}

export interface TotalsResult {
  order_id: string;
  default_split_rule: SplitRule;
  users: Array<{
    user_id: string;
    subtotal_cents: number;
    fees_cents: number;
    total_cents: number;
  }>;
  grand_subtotal_cents: number;
  grand_fees_cents: number;
  grand_total_cents: number;
}
