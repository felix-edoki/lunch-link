"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { toCents } from "@/lib/money";
import { revalidatePath } from "next/cache";

export async function addItem(orderId: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const qty = Math.max(1, parseInt(String(formData.get("qty") || "1"), 10) || 1);
  const priceCents = toCents(String(formData.get("price") || "0"));
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!name) throw new Error("name is required");
  if (priceCents < 0) throw new Error("price must be >= 0");

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { error } = await supabase.from("order_items").insert({
    order_id: orderId,
    user_id: user.id,
    created_by: user.id,
    name, qty, unit_price_cents: priceCents, notes,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}

export async function updateItem(itemId: string, orderId: string, formData: FormData) {
  const patch: Record<string, unknown> = {};
  const name = formData.get("name");
  const qty = formData.get("qty");
  const price = formData.get("price");
  const notes = formData.get("notes");
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof qty === "string" && qty) patch.qty = Math.max(1, parseInt(qty, 10) || 1);
  if (typeof price === "string" && price) patch.unit_price_cents = toCents(price);
  if (typeof notes === "string") patch.notes = notes.trim() || null;

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("order_items").update(patch).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}

export async function deleteItem(itemId: string, orderId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("order_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}
