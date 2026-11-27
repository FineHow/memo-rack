import { contextBridge, ipcRenderer } from "electron";
const surface =
  process.argv.find((s) => s.startsWith("--surface="))?.split("=")[1] ||
  "board";
const listen = (name: string, callback: (value: unknown) => void) => {
  const handler = (_event: unknown, value: unknown) => callback(value);
  ipcRenderer.on(name, handler);
  return () => ipcRenderer.removeListener(name, handler);
};
contextBridge.exposeInMainWorld("clotheslineDesktop", {
  platform: "macos",
  surface,
  laundry: (command?: unknown) => ipcRenderer.invoke("laundry", command),
  companion: (action: string, value = "") =>
    ipcRenderer.invoke("companion", action, value),
  widget: (action: string, value?: unknown) =>
    ipcRenderer.invoke("widget", action, value),
  geometry: () => ipcRenderer.invoke("geometry"),
  interact: (active: boolean, captured = false) =>
    ipcRenderer.send("interact", active, captured),
  overlay: (frame: unknown) => ipcRenderer.send("overlay-frame", frame),
  onStatus: (callback: (value: unknown) => void) => {
    const off = listen("desktop-status", callback);
    let active = true;
    void ipcRenderer.invoke("status").then((value) => {
      if (active) callback(value);
    });
    return () => {
      active = false;
      off();
    };
  },
  onOverlay: (callback: (value: unknown) => void) =>
    listen("desktop-overlay", callback),
  onPursuit: (callback: (value: unknown) => void) =>
    listen("desktop-pursuit", callback),
  onChange: (callback: (value: unknown) => void) =>
    listen("desktop-change", callback),
});
