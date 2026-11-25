"use client";
import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
export function useSystemReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
