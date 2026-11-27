"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { storageError } from "./storage-errors";
import { desktopBridge } from "./desktop-bridge";
import {
  EMPTY_COMPANIONS,
  starterCompanions,
  migrateCompanions,
  validateCompanions,
  type CompanionState,
} from "./companion";
const KEY = "memo-rack-companion-v2";
export function nativeToken() {
  if (desktopBridge()) return "macos-ipc";
  return typeof document === "undefined"
    ? undefined
    : document.querySelector<HTMLMetaElement>('meta[name="clothesline-native"]')
        ?.content;
}
export async function companionRequest(action: string, value = "") {
  const bridge = desktopBridge();
  if (bridge) return bridge.companion(action, value);
  const r = await fetch("/api/companion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Clothesline-Token": nativeToken()!,
    },
    body: JSON.stringify({ action, value }),
  }).catch(() => {
    throw Error("桌面连接已断开，请检查程序并重试读取");
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "桌面已断开，请从托盘重新打开后重试");
  return result;
}
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("clothesline-photos-v2", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("assets");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = undefined;
      reject(Error("照片存储无法打开，请检查浏览器存储权限后重试"));
    };
    req.onblocked = () => {
      dbPromise = undefined;
      reject(Error("照片存储被其他窗口占用，请关闭其他页面后重试"));
    };
  }));
}
export async function putAsset(blob: Blob): Promise<string> {
  if (blob.size > 20 * 1024 * 1024) throw Error("照片超过 20MB，请缩小后重试");
  if (nativeToken() && blob.type === "image/webp") {
    const bitmap = await createImageBitmap(blob),
      c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob(
        (b) => (b ? resolve(b) : reject(Error("无法转换 WebP 照片"))),
        "image/png",
      ),
    );
  }
  if (nativeToken())
    return (
      await companionRequest(
        "asset",
        await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(blob);
        }),
      )
    ).ref;
  const id = "asset:" + crypto.randomUUID(),
    db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(
          Error(
            "照片保存失败，可能存储空间不足；已上架版本保持不变，请释放空间后重试",
          ),
        );
    });
  } catch (e) {
    throw storageError(e);
  }
  return id;
}
const urls = new Map<string, string>();
export async function assetUrl(ref: string) {
  if (!ref.startsWith("asset:")) return ref;
  if (urls.has(ref)) return urls.get(ref)!;
  const db = await database();
  const blob = await new Promise<Blob>((resolve, reject) => {
    const r = db.transaction("assets").objectStore("assets").get(ref);
    r.onsuccess = () =>
      r.result
        ? resolve(r.result)
        : reject(Error("照片素材缺失，请恢复备份或替换照片"));
    r.onerror = reject;
  });
  const url = URL.createObjectURL(blob);
  urls.set(ref, url);
  return url;
}
export function useAssetResource(ref: string) {
  const [state, setState] = useState({ ref: "", url: "", error: "" });
  useEffect(() => {
    let active = true;
    void assetUrl(ref)
      .then((url) => {
        if (active) setState({ ref, url, error: "" });
      })
      .catch((e) => {
        if (active) setState({ ref, url: "", error: storageError(e).message });
      });
    return () => {
      active = false;
    };
  }, [ref]);
  return state.ref === ref
    ? state
    : { ref, url: ref.startsWith("asset:") ? "" : ref, error: "" };
}
export function useAsset(ref: string) {
  return useAssetResource(ref).url;
}

type Snapshot = {
  state: CompanionState;
  ready: boolean;
  error: string;
  saving: boolean;
};
const initial: Snapshot = {
  state: EMPTY_COMPANIONS,
  ready: false,
  error: "",
  saving: false,
};
let snapshot = initial;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let init: Promise<void> | undefined;
let writeGeneration = 0;
let liveBound = false;
async function initialize() {
  return (init ??= (async () => {
    try {
      let state: CompanionState;
      if (nativeToken()) state = await companionRequest("read2");
      else {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          state = validateCompanions(JSON.parse(raw));
          if (!state.starterApplied && state.members.length === 0) {
            state = starterCompanions(state.revision + 1);
            localStorage.setItem(KEY + "-backup", raw);
            localStorage.setItem(KEY, JSON.stringify(state));
          }
        } else {
          const legacy = localStorage.getItem("memo-rack-companion");
          state = legacy
            ? migrateCompanions(JSON.parse(legacy))
            : starterCompanions();
          if (legacy) {
            localStorage.setItem("memo-rack-companion-backup", legacy);
            for (const m of state.members) {
              for (const k of ["original", "result", "chasePhoto"] as const)
                if (m[k].startsWith("data:"))
                  m[k] = await putAsset(await (await fetch(m[k])).blob());
            }
          }
          localStorage.setItem(KEY, JSON.stringify(state));
        }
      }
      snapshot = {
        state: validateCompanions(state),
        ready: true,
        error: "",
        saving: false,
      };
      emit();
      liveBound = true;
      desktopBridge()?.onChange(() => {
        if (!snapshot.saving) void retryCompanions().catch(() => {});
      });
      if (nativeToken())
        setInterval(() => {
          const generation = writeGeneration;
          if (!snapshot.saving)
            void companionRequest("read2")
              .then((state) => {
                if (generation !== writeGeneration || snapshot.saving) return;
                if (
                  state.revision !== snapshot.state.revision ||
                  snapshot.error
                ) {
                  snapshot = {
                    ...snapshot,
                    state: validateCompanions(state),
                    error: "",
                  };
                  emit();
                }
              })
              .catch(() => {
                if (generation !== writeGeneration || snapshot.saving) return;
                snapshot = {
                  ...snapshot,
                  error: "桌面连接已断开，请重新打开后重试",
                };
                emit();
              });
        }, 2000);
      else
        window.addEventListener("storage", (e) => {
          if (e.key === KEY && e.newValue) {
            try {
              snapshot = {
                ...snapshot,
                state: validateCompanions(JSON.parse(e.newValue)),
                error: "",
              };
              emit();
            } catch {
              snapshot = {
                ...snapshot,
                error: "另一窗口搭子数据损坏，已保留当前版本",
              };
              emit();
            }
          }
        });
    } catch (e) {
      snapshot = {
        ...snapshot,
        ready: true,
        error: e instanceof Error ? e.message : "搭子读取失败",
      };
      emit();
    }
  })());
}
export async function saveCompanions(draft: CompanionState) {
  await initialize();
  if (snapshot.error)
    throw Error(`暂时不能保存，请先重试读取：${snapshot.error}`);
  draft = validateCompanions({ ...draft, starterApplied: true });
  writeGeneration++;
  snapshot = { ...snapshot, saving: true };
  emit();
  try {
    let next: CompanionState;
    if (nativeToken())
      next = await companionRequest("save2", JSON.stringify(draft));
    else {
      await verifyAssets(draft);
      const current = localStorage.getItem(KEY);
      if (current && JSON.parse(current).revision !== draft.revision)
        throw Error("另一个窗口已保存搭子，请取消草稿并重新编辑");
      next = { ...draft, revision: draft.revision + 1 };
      if (current) localStorage.setItem(KEY + "-backup", current);
      localStorage.setItem(KEY, JSON.stringify(next));
    }
    snapshot = { state: next, ready: true, error: "", saving: false };
    emit();
    return next;
  } catch (e) {
    snapshot = { ...snapshot, saving: false };
    emit();
    throw storageError(e);
  }
}
async function verifyAssets(state: CompanionState) {
  const refs = [
    ...new Set(
      state.members
        .flatMap((m) => [
          m.original,
          m.result,
          m.working || "",
          m.repairSource || "",
          m.customDoll?.source || "",
          m.customDoll?.cutout || "",
          m.customDoll?.openingMask || "",
        ])
        .filter((r) => r.startsWith("asset:")),
    ),
  ];
  if (!refs.length) return;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("assets"),
      store = tx.objectStore("assets");
    for (const ref of refs) {
      const r = store.get(ref);
      r.onsuccess = () => {
        if (!r.result)
          reject(Error("照片素材缺失，请重新编辑或恢复备份后再保存"));
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(Error("无法验证照片存储，请重试"));
  });
}
export async function retryCompanions() {
  if (!liveBound) {
    init = undefined;
    await initialize();
    if (snapshot.error) throw Error(snapshot.error);
    return;
  }
  try {
    const raw = nativeToken()
      ? await companionRequest("read2")
      : JSON.parse(
          localStorage.getItem(KEY) || JSON.stringify(EMPTY_COMPANIONS),
        );
    const state = validateCompanions(raw);
    snapshot = { state, ready: true, error: "", saving: false };
    emit();
  } catch (e) {
    snapshot = { ...snapshot, error: storageError(e).message };
    emit();
    throw storageError(e);
  }
}
export async function restoreCompanionBackup() {
  if (nativeToken())
    throw Error("请按本机备份说明恢复 companions-v2.json.bak 后重新打开程序");
  const raw = localStorage.getItem(KEY + "-backup");
  if (!raw) throw Error("没有可恢复的搭子备份");
  const state = validateCompanions(JSON.parse(raw));
  await verifyAssets(state);
  const rejected = localStorage.getItem(KEY);
  if (rejected) localStorage.setItem(KEY + "-rejected-" + Date.now(), rejected);
  localStorage.setItem(KEY, raw);
  await retryCompanions();
}
export function useCompanions() {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
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
