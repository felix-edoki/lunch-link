import { createOrder } from "@/app/actions/orders";

export default function NewOrderPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">New order</h1>
      <form action={createOrder} className="space-y-3 rounded border p-4">
        <label className="block text-sm">
          Title
          <input name="title" required className="mt-1 w-full rounded border p-2" placeholder="Friday lunch" />
        </label>
        <label className="block text-sm">
          Currency
          <input name="currency" defaultValue="CAD" className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block text-sm">
          Default fee split
          <select name="split" defaultValue="proportional_to_items" className="mt-1 w-full rounded border p-2">
            <option value="proportional_to_items">Proportional to items</option>
            <option value="even">Even</option>
          </select>
        </label>
        <button className="rounded bg-black px-4 py-2 text-white">Create</button>
      </form>
    </main>
  );
}
