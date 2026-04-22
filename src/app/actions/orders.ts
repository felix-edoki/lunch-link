"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SplitRule } from "@/lib/types";

export async function createOrder(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const currency = String(formData.get("currency") || "CAD");
  const split = (String(formData.get("split") || "proportional_to_items") as SplitRule);
  if (!title) throw new Error("title is required");

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data, error } = await supabase
    .from("orders")
    .insert({
      organizer_id: user.id,
      title,
      currency,
      default_split_rule: split,
      status: "collecting",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  redirect(`/orders/${data.id}`);
}

export async function joinOrder(orderId: string, displayName: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { error } = await supabase
    .from("order_participants")
    .upsert({
      order_id: orderId,
      user_id: user.id,
      display_name: displayName || user.email || "Guest",
    }, { onConflict: "order_id,user_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}

export async function setOrderStatus(
  orderId: string,
  status: "collecting" | "submitted" | "cancelled" | "archived"
) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}
