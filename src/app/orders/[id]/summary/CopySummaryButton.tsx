"use client";
import { useState } from "react";

export default function CopySummaryButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded bg-black px-3 py-1.5 text-sm text-white"
    >
      {copied ? "Copied!" : "Copy summary"}
    </button>
  );
}
