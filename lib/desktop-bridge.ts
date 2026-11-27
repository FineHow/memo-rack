import type { LaundryCommand, LaundryState } from "./laundry";
import type { CompanionState, Companion } from "./companion";

export type DesktopCue = {
  id: string;
  memberId: string;
  phase: "near" | "overdue";
  text: string;
  chase: boolean;
  startedAt: number;
};
export type DesktopStatus = {
  cue: DesktopCue | null;
  chat: { memberId: string; text: string } | null;
  reduced: boolean;
};
export type OverlayFrame = {
  kind: "buddy" | "memo";
  home: { x: number; y: number; width: number; height: number };
  member?: Companion;
  pose?: {
    x: number;
    y: number;
    angle: number;
    flip: boolean;
    detached: boolean;
    flying: boolean;
    heading?: number;
    held?: boolean;
    slap?: boolean;
    recoil?: { x: number; y: number };
  };
  pins?: number[];
  aim?: { shotX: number; shotY: number } | null;
  task?: LaundryState["tasks"][number];
  urgentMinutes?: number;
  transform?: string;
  flight?: {
    targetX: number;
    targetY: number;
    thrown: boolean;
    reduced: boolean;
  };
};
export interface DesktopBridge {
  platform: "macos";
  surface: "board" | "widget" | "overlay" | "chase";
  laundry(command?: LaundryCommand): Promise<LaundryState>;
  companion(
    action: string,
    value?: string,
  ): Promise<CompanionState & { ref?: string }>;
  widget(
    action: "show" | "hide" | "board" | "quit" | "data" | "move",
    value?: { x: number; y: number },
  ): Promise<void>;
  interact(active: boolean, captured?: boolean): void;
  overlay(frame: OverlayFrame | null): void;
  onStatus(callback: (status: DesktopStatus) => void): () => void;
  onOverlay(callback: (frame: OverlayFrame | null) => void): () => void;
  onPursuit(
    callback: (pose: { lean: number; stride: number }) => void,
  ): () => void;
  onChange(callback: () => void): () => void;
  geometry(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
    desktop: { x: number; y: number; width: number; height: number };
  }>;
}
declare global {
  interface Window {
    clotheslineDesktop?: DesktopBridge;
  }
}
export function desktopBridge() {
  return typeof window === "undefined" ? undefined : window.clotheslineDesktop;
}
export function isDesktopWidget() {
  return desktopBridge()?.surface === "widget";
}
