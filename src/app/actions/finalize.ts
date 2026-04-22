"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import type { TotalsResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function calculateTotals(orderId: string): Promise<TotalsResult> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("calculate_order_totals", { p_order: orderId });
  if (error) throw new Error(error.message);
  return data as TotalsResult;
}

export async function finalizeOrder(orderId: string): Promise<TotalsResult> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("finalize_order", { p_order: orderId });
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/summary`);
  return data as TotalsResult;
}
