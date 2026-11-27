"use client";

import { useEffect, useSyncExternalStore } from "react";
import { storageError } from "./storage-errors";
import { desktopBridge } from "./desktop-bridge";
import {
  applyCommand,
  EMPTY_LAUNDRY,
  validateState,
  type LaundryCommand,
  type LaundryState,
} from "./laundry";

const KEY = "clothesline-tasks-v2";
const LEGACY_KEY = "clothesline-tasks-v1";
function nativeToken() {
  if (desktopBridge()) return "macos-ipc";
  return document.querySelector<HTMLMetaElement>(
    'meta[name="clothesline-native"]',
  )?.content;
}
async function nativeRequest(command?: LaundryCommand): Promise<LaundryState> {
  const bridge = desktopBridge();
  if (bridge) return validateState(await bridge.laundry(command));
  const response = await fetch(
    "/api/laundry",
    command
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Clothesline-Token": nativeToken()!,
          },
          body: JSON.stringify(command),
        }
      : { cache: "no-store" },
  ).catch(() => {
    throw Error("桌面便签架已断开，请检查程序并重试读取");
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "桌面便签架暂时无法连接");
  return validateState(result);
}
export async function showDesktopWidget() {
  const bridge = desktopBridge();
  if (bridge) return bridge.widget("show");
  const token = nativeToken();
  if (!token)
    throw new Error(
      "请从 Windows 版打开看板，即可召回桌面便签架。浏览器独立预览不支持桌面置顶。",
    );
  const response = await fetch("/api/widget", {
    method: "POST",
    headers: { "X-Clothesline-Token": token },
    body: "{}",
  });
  if (!response.ok) throw new Error("无法召回便签架，请从托盘图标打开");
}
type Snapshot = {
  state: LaundryState;
  ready: boolean;
  error: string;
  saving?: boolean;
};
const initial: Snapshot = { state: EMPTY_LAUNDRY, ready: false, error: "" };
let snapshot = initial;
let initializing: Promise<void> | undefined;
let writeGeneration = 0;
let liveBound = false;
let writeQueue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
function publish(state: LaundryState, error = "") {
  snapshot = { state, ready: true, error };
  for (const listener of listeners) listener();
}
async function initialize() {
  if (initializing) return initializing;
  initializing = (async () => {
    try {
      if (nativeToken()) {
        publish(await nativeRequest());
        desktopBridge()?.onChange(() => {
          if (!snapshot.saving) void retryLaundry().catch(() => {});
        });
        liveBound = true;
        setInterval(() => {
          if (snapshot.saving) return;
          const generation = writeGeneration;
          void nativeRequest()
            .then((state) => {
              if (generation !== writeGeneration || snapshot.saving) return;
              if (
                JSON.stringify(state) !== JSON.stringify(snapshot.state) ||
                snapshot.error
              )
                publish(state);
            })
            .catch(() => {
              if (generation !== writeGeneration || snapshot.saving) return;
              publish(
                snapshot.state,
                "桌面便签架已断开，请重新打开桌面程序后刷新页面",
              );
            });
        }, 2000);
      } else {
        let raw = window.localStorage.getItem(KEY);
        if (!raw) {
          const legacy = window.localStorage.getItem(LEGACY_KEY);
          if (legacy) {
            window.localStorage.setItem("clothesline-tasks-v1-backup", legacy);
            raw = JSON.stringify(validateState(JSON.parse(legacy)));
            window.localStorage.setItem(KEY, raw);
          }
        }
        publish(raw ? validateState(JSON.parse(raw)) : EMPTY_LAUNDRY);
        liveBound = true;
        window.addEventListener("storage", (event) => {
          if (event.key !== KEY) return;
          try {
            publish(
              event.newValue
                ? validateState(JSON.parse(event.newValue))
                : EMPTY_LAUNDRY,
            );
          } catch {
            publish(
              snapshot.state,
              "另一个窗口的数据无法读取，请先备份后重新加载",
            );
          }
        });
      }
    } catch (error) {
      publish(
        EMPTY_LAUNDRY,
        error instanceof Error
          ? error.message
          : "本机待办读取失败，请检查存储权限",
      );
    }
  })();
  return initializing;
}
export function dispatchLaundry(command: LaundryCommand) {
  const operation = writeQueue
    .catch(() => {})
    .then(() => executeCommand(command));
  writeQueue = operation;
  return operation;
}
export async function retryLaundry() {
  if (!liveBound) {
    initializing = undefined;
    await initialize();
    if (snapshot.error) throw Error(snapshot.error);
    return;
  }
  if (nativeToken()) {
    publish(await nativeRequest());
    return;
  }
  const raw = localStorage.getItem(KEY);
  publish(raw ? validateState(JSON.parse(raw)) : EMPTY_LAUNDRY);
}
async function executeCommand(command: LaundryCommand) {
  await initialize();
  if (snapshot.error)
    throw new Error(`为保护已有记录，暂时停止写入：${snapshot.error}`);
  writeGeneration++;
  snapshot = { ...snapshot, saving: true };
  for (const l of listeners) l();
  try {
    if (nativeToken()) {
      publish(await nativeRequest(command));
    } else {
      // Read the latest committed value before applying a command from another tab.
      const raw = window.localStorage.getItem(KEY);
      const next = applyCommand(
        raw ? validateState(JSON.parse(raw)) : snapshot.state,
        command,
      );
      if (raw) window.localStorage.setItem(KEY + "-backup", raw);
      window.localStorage.setItem(KEY, JSON.stringify(next));
      publish(next);
    }
    if (command.type === "complete")
      window.dispatchEvent(
        new CustomEvent("laundry-completed", { detail: command.id }),
      );
  } catch (e) {
    snapshot = { ...snapshot, saving: false };
    for (const l of listeners) l();
    throw storageError(e);
  }
}
export function useLaundry() {
  const value = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => snapshot,
    () => initial,
  );
  useEffect(() => {
    void initialize();
  }, []);
  return value;
}
let clock = 0;
const clockListeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | undefined;
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  clock = Date.now();
  if (!interval)
    interval = setInterval(() => {
      clock = Date.now();
      for (const l of clockListeners) l();
    }, 1000);
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}
export function useClock() {
  return useSyncExternalStore(
    subscribeClock,
    () => clock,
    () => 0,
  );
}
