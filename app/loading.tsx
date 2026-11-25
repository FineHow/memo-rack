import { StickyNote } from "lucide-react";

export default function Loading() {
  return (
    <main className="loading-screen" aria-live="polite">
      <StickyNote className="loading-shirt" size={36} strokeWidth={1} />
      <p>当个事儿办！…</p>
    </main>
  );
}
