"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { toCents } from "@/lib/money";
import { revalidatePath } from "next/cache";
import type { SplitRule } from "@/lib/types";

export async function addFee(orderId: string, formData: FormData) {
  const label = String(formData.get("label") || "").trim();
  const amountCents = toCents(String(formData.get("amount") || "0"));
  const split = (String(formData.get("split") || "proportional_to_items") as SplitRule);
  if (!label) throw new Error("label is required");
  if (amountCents < 0) throw new Error("amount must be >= 0");

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { error } = await supabase.from("order_fees").insert({
    order_id: orderId, label, amount_cents: amountCents, split, created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}

export async function deleteFee(feeId: string, orderId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("order_fees").delete().eq("id", feeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}
