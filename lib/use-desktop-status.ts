"use client";
import { useEffect, useState } from "react";
import { desktopBridge, type DesktopStatus } from "./desktop-bridge";
export function useDesktopStatus() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  useEffect(() => desktopBridge()?.onStatus(setStatus), []);
  return status;
}
