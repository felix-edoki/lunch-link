import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lunch Link",
  description: "Real-time group ordering",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto max-w-3xl p-4">
          <header className="mb-6 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold">🥪 Lunch Link</a>
            <nav className="text-sm text-neutral-500">
              <a href="/orders/new" className="hover:underline">New order</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
