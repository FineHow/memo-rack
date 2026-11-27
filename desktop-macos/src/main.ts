import {
  app,
  BrowserWindow,
  protocol,
  ipcMain,
  nativeImage,
  Tray,
  Menu,
  shell,
  screen,
  powerMonitor,
  systemPreferences,
  dialog,
} from "electron";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { Repository, ReminderEngine, atomicWrite } from "./core";
import { CursorPursuit } from "./pursuit";
import { companionLine, isQuiet } from "../../lib/reminders";
import type { LaundryCommand } from "../../lib/laundry";
import type { DesktopStatus, OverlayFrame } from "../../lib/desktop-bridge";

const testMode = process.argv.includes("--prototype-test");
const data =
  process.env.CLOTHESLINE_DATA_DIR ||
  path.join(app.getPath("appData"), "Clothesline-macOS");
app.setPath("userData", path.join(data, "chromium"));
app.setName("晾一晾");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    board?.show();
    board?.focus();
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("晾一晾启动失败", String(error));
      app.exit(1);
    });
}
let board: BrowserWindow | undefined,
  widget: BrowserWindow | undefined,
  overlay: BrowserWindow | undefined,
  chase: BrowserWindow | undefined;
let repository: Repository,
  tray: Tray,
  suspended = false,
  quitting = false,
  captured = false;
let hostTimer: ReturnType<typeof setInterval>,
  mouseTimer: ReturnType<typeof setInterval> | undefined;
let status: DesktopStatus = { cue: null, chat: null, reduced: false };
let chatUntil = 0,
  nextChat = 0,
  lastCue = "",
  lastStatus = "";
let overlayArea = "";
let widgetScale = 1,
  widgetBaseWidth = 1100;
const widgetBaseHeight = 380;
const engine = new ReminderEngine();
let pursuit: CursorPursuit | undefined,
  pursuitDisplay: number | undefined,
  lastPursuitFrame = 0,
  lastPursuitPaint = 0,
  lastPursuitPose = "";
const roles = new Map<number, string>();
const web = path.join(__dirname, "web");
const diagnostics: Record<string, unknown> = { events: [], resourceErrors: [] };
function event(name: string, detail?: unknown) {
  const events = diagnostics.events as unknown[];
  events.push({ at: Date.now(), name, detail });
  if (events.length > 200) events.shift();
  if (testMode)
    fs.writeFileSync(
      path.join(data, "diagnostics.json"),
      JSON.stringify(diagnostics, null, 2),
    );
}
function send(name: string, value?: unknown) {
  for (const win of BrowserWindow.getAllWindows())
    if (!win.isDestroyed()) win.webContents.send(name, value);
}
function originAllowed(url: string) {
  return url.startsWith("app://bundle/");
}
function verify(
  e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  allowed?: string[],
) {
  if (
    !originAllowed(e.senderFrame?.url || "") ||
    !roles.has(e.sender.id) ||
    e.senderFrame !== e.sender.mainFrame ||
    (allowed && !allowed.includes(roles.get(e.sender.id)!))
  )
    throw Error("拒绝未授权的桌面调用");
}
function windowFor(
  surface: string,
  options: Electron.BrowserWindowConstructorOptions,
) {
  const win = new BrowserWindow({
    show: false,
    acceptFirstMouse: true,
    icon: path.join(web, "brand/app-icon.png"),
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomMode: "isolated",
      zoomFactor:
        surface === "widget" || surface === "overlay" ? widgetScale : 1,
      backgroundThrottling:
        surface !== "widget" && surface !== "overlay" && surface !== "chase",
      additionalArguments: ["--surface=" + surface],
    },
  });
  roles.set(win.webContents.id, surface);
  if (surface === "board" || surface === "widget")
    win.webContents.on("before-input-event", (e, input) => {
      if (input.type !== "keyDown" || !input.meta || input.alt || input.control)
        return;
      const change =
        ["+", "="].includes(input.key) || input.code === "NumpadAdd"
          ? 1
          : input.key === "-" || input.code === "NumpadSubtract"
            ? -1
            : input.key === "0"
              ? 0
              : undefined;
      if (change === undefined) return;
      e.preventDefault();
      zoomWidget(change);
    });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "https://xiangsuwuxian.gulu9832.xyz/")
      void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!originAllowed(url)) e.preventDefault();
  });
  win.webContents.on("did-fail-load", (_e, code, description) =>
    event("load-failed", { surface, code, description }),
  );
  win.webContents.on("render-process-gone", (_e, detail) => {
    event("renderer-gone", { surface, detail });
    if (surface === "widget") {
      captured = false;
      overlay?.hide();
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  });
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("desktop-status", status);
    event("loaded", surface);
  });
  const contentsId = win.webContents.id;
  win.on("closed", () => roles.delete(contentsId));
  void win.loadURL(
    "app://bundle/" +
      (surface === "board" ? "" : surface === "widget" ? "widget" : "overlay") +
      (surface === "chase" ? "?chase=1" : ""),
  );
  return win;
}
function transparent(surface: string, bounds: Electron.Rectangle) {
  const win = windowFor(surface, {
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: surface === "widget",
    type: surface === "widget" ? "panel" : "toolbar",
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: surface === "widget" });
  return win;
}
function showBoard(hash = "") {
  if (hash) void board?.loadURL("app://bundle/" + hash);
  board?.show();
  board?.focus();
}
function showWidget() {
  widget?.showInactive();
  event("widget-shown");
}
function hideWidget() {
  widget?.hide();
  captured = false;
  overlay?.hide();
  event("widget-hidden");
}
function saveWidgetBounds() {
  if (widget)
    atomicWrite(path.join(data, "widget-macos.json"), {
      ...widget.getBounds(),
      scale: widgetScale,
    });
}
function zoomWidget(change: number) {
  if (!widget || captured) return;
  const b = widget.getBounds(),
    area = screen.getDisplayMatching(b).workArea;
  const maximum = Math.min(
    2,
    (area.width - 40) / widgetBaseWidth,
    (area.height - 20) / widgetBaseHeight,
  );
  const next = Math.max(
    0.5,
    Math.min(
      maximum,
      change === 0 ? 1 : Math.round((widgetScale + change * 0.1) * 10) / 10,
    ),
  );
  widgetScale = next;
  overlay?.hide();
  widget.webContents.setZoomFactor(next);
  overlay?.webContents.setZoomFactor(next);
  const width = Math.round(widgetBaseWidth * next),
    height = Math.round(widgetBaseHeight * next);
  widget.setBounds({
    x: Math.round(
      Math.max(
        area.x,
        Math.min(b.x + (b.width - width) / 2, area.x + area.width - width),
      ),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(b.y, area.y + area.height - height)),
    ),
    width,
    height,
  });
  saveWidgetBounds();
  showWidget();
  event("widget-zoom", next);
}
function displayUnion() {
  const d = screen.getAllDisplays().map((x) => x.bounds);
  const x = Math.min(...d.map((v) => v.x)),
    y = Math.min(...d.map((v) => v.y));
  return {
    x,
    y,
    width: Math.max(...d.map((v) => v.x + v.width)) - x,
    height: Math.max(...d.map((v) => v.y + v.height)) - y,
  };
}
function keepVisible() {
  overlay?.hide();
  captured = false;
  if (!widget) return;
  const b = widget.getBounds(),
    area = screen.getDisplayMatching(b).workArea;
  widget.setBounds({
    ...b,
    x: Math.round(
      Math.max(
        area.x - b.width + 120,
        Math.min(b.x, area.x + area.width - 120),
      ),
    ),
    y: Math.round(Math.max(area.y, Math.min(b.y, area.y + area.height - 80))),
  });
}
async function start() {
  fs.mkdirSync(data, { recursive: true });
  repository = new Repository(data);
  protocol.handle("app", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== "bundle")
        return new Response("Forbidden", { status: 403 });
      const pathname = decodeURIComponent(url.pathname);
      let root = web,
        relative = pathname.slice(1);
      if (pathname.startsWith("/assets/")) {
        if (!/^\/assets\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(pathname))
          return new Response("Not found", { status: 404 });
        root = data;
      } else if (pathname === "/") relative = "index.html";
      else if (pathname === "/widget" || pathname === "/overlay")
        relative += ".html";
      const file = path.resolve(root, relative),
        within = path.relative(root, file);
      if (
        !within ||
        within.startsWith("..") ||
        path.isAbsolute(within) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      )
        return new Response("Not found", { status: 404 });
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
        ".wav": "audio/wav",
        ".onnx": "application/octet-stream",
        ".ico": "image/x-icon",
      };
      const headers: Record<string, string> = {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      };
      if (file.endsWith(".html"))
        headers["Content-Security-Policy"] =
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'";
      return new Response(fs.readFileSync(file), { headers });
    } catch (error) {
      event("resource-error", String(error));
      return new Response("Resource error", { status: 400 });
    }
  });
  const display = screen.getPrimaryDisplay().workArea;
  board = windowFor("board", {
    width: Math.min(1280, display.width - 60),
    height: Math.min(900, display.height - 60),
    minWidth: 760,
    minHeight: 560,
    title: "晾一晾 · 看板",
    backgroundColor: "#f7f3ef",
  });
  board.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      board?.hide();
    }
  });
  let saved: { x?: number; y?: number; scale?: number } = {};
  try {
    saved = JSON.parse(
      fs.readFileSync(path.join(data, "widget-macos.json"), "utf8"),
    );
  } catch {
    /* first launch */
  }
  widgetBaseWidth = Math.min(1100, display.width - 40);
  widgetScale = Math.max(
    0.5,
    Math.min(
      Number.isFinite(saved.scale) ? saved.scale! : 1,
      2,
      (display.width - 40) / widgetBaseWidth,
      (display.height - 20) / widgetBaseHeight,
    ),
  );
  const width = Math.round(widgetBaseWidth * widgetScale);
  widget = transparent("widget", {
    x: Math.round(saved.x ?? display.x + (display.width - width) / 2),
    y: Math.round(saved.y ?? display.y + 20),
    width,
    height: Math.round(widgetBaseHeight * widgetScale),
  });
  widget.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      hideWidget();
    }
  });
  overlay = transparent("overlay", displayUnion());
  chase = transparent("chase", { x: 0, y: 0, width: 270, height: 300 });
  const icon = nativeImage
    .createFromDataURL(
      "data:image/png;base64," +
        fs
          .readFileSync(path.join(web, "brand/app-icon.png"))
          .toString("base64"),
    )
    .resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip("晾一晾 · macOS 原型");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示便签架", click: showWidget },
      { label: "隐藏便签架", click: hideWidget },
      { label: "打开看板", click: () => showBoard() },
      { label: "我的搭子", click: () => showBoard("#companions") },
      {
        label: "安静 / 恢复提醒",
        click: () => {
          repository.command({
            type: "settings",
            input: {
              ...repository.tasks.settings,
              quiet: !isQuiet(repository.tasks, Date.now()),
              quietUntil: 0,
            },
          });
          changed();
        },
      },
      {
        label: "原型测试：10 秒后到期",
        click: () => {
          const now = Date.now();
          repository.command({
            type: "add",
            id: crypto.randomUUID(),
            input: {
              title: "桌面追逐体验",
              note: "菜单栏手动创建的原型测试便签，可完成或稍后。",
              category: "生活",
              color: "sage",
              dueAt: now + 10000,
            },
          });
          changed();
          showWidget();
        },
      },
      {
        label: "查看数据目录",
        click: () => {
          void shell.openPath(data);
        },
      },
      { type: "separator" },
      { label: "退出晾一晾", click: () => app.quit() },
    ]),
  );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "晾一晾",
        submenu: [
          { label: "打开看板", click: () => showBoard() },
          { label: "显示便签架", click: showWidget },
          { type: "separator" },
          { role: "quit", label: "退出晾一晾" },
        ],
      },
      { role: "editMenu", label: "编辑" },
      {
        label: "视图",
        submenu: [
          {
            label: "放大便签架",
            accelerator: "Command+=",
            click: () => zoomWidget(1),
          },
          {
            label: "缩小便签架",
            accelerator: "Command+-",
            click: () => zoomWidget(-1),
          },
          {
            label: "恢复便签架原始大小",
            accelerator: "Command+0",
            click: () => zoomWidget(0),
          },
        ],
      },
      { role: "windowMenu", label: "窗口" },
    ]),
  );
  ipcMain.handle("status", (e) => {
    verify(e);
    return status;
  });
  ipcMain.handle("laundry", (e, command?: LaundryCommand) => {
    verify(e, ["board", "widget"]);
    if (!command) return repository.tasks;
    const previous = repository.tasks.tasks.find(
      (t) => t.id === ("id" in command ? command.id : ""),
    );
    const result = repository.command(command);
    if (
      command.type === "complete" &&
      previous &&
      previous.completedAt === null
    ) {
      const m = repository.friends.members.find(
        (m) => m.id === (previous.companionId || repository.friends.currentId),
      );
      if (m) {
        status.chat = {
          memberId: m.id,
          text: companionLine(m, "done", previous),
        };
        chatUntil = Date.now() + 5500;
      }
    }
    changed();
    return result;
  });
  ipcMain.handle("companion", (e, action: string, value: string) => {
    verify(e);
    if (action === "read2") return repository.friends;
    verify(e, ["board", "widget"]);
    if (action === "save2") {
      const result = repository.saveFriends(JSON.parse(value));
      nextChat = 0;
      changed();
      return result;
    }
    if (action === "asset") {
      const match =
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
      if (!match || value.length > 30_000_000)
        throw Error("照片格式或大小无效");
      const bytes = Buffer.from(match[2], "base64"),
        image = nativeImage.createFromBuffer(bytes),
        size = image.getSize();
      if (image.isEmpty() || size.width * size.height > 40_000_000)
        throw Error("照片损坏或像素过大");
      return {
        ref: repository.asset(bytes, match[1] === "jpeg" ? "jpg" : match[1]),
      };
    }
    throw Error("不支持的搭子操作");
  });
  ipcMain.handle(
    "widget",
    (e, action: string, value: { x: number; y: number }) => {
      verify(e, ["board", "widget"]);
      if (action === "show") showWidget();
      else if (action === "hide") hideWidget();
      else if (action === "board") showBoard();
      else if (action === "quit") app.quit();
      else if (action === "data") void shell.openPath(data);
      else if (
        action === "move" &&
        roles.get(e.sender.id) === "widget" &&
        Number.isFinite(value?.x) &&
        Number.isFinite(value?.y)
      ) {
        widget?.setPosition(Math.round(value.x), Math.round(value.y));
        saveWidgetBounds();
      } else throw Error("无效的窗口操作");
    },
  );
  ipcMain.handle("geometry", (e) => {
    verify(e);
    const b = widget!.getBounds(),
      u = displayUnion();
    return {
      ...b,
      desktop: {
        x: (b.x - u.x) / widgetScale,
        y: (b.y - u.y) / widgetScale,
        width: u.width / widgetScale,
        height: u.height / widgetScale,
      },
    };
  });
  ipcMain.on("interact", (e, active: boolean, capture: boolean) => {
    verify(e, ["widget"]);
    captured = !!capture;
    widget?.setIgnoreMouseEvents(!active && !captured, { forward: true });
    event("hit-test", { active, captured });
  });
  ipcMain.on("overlay-frame", (e, frame: OverlayFrame | null) => {
    verify(e, ["widget"]);
    if (!frame) {
      overlay?.webContents.send("desktop-overlay", null);
      overlay?.hide();
      event("overlay-ended");
      return;
    }
    if (
      !["buddy", "memo"].includes(frame.kind) ||
      !frame.home ||
      ![frame.home.x, frame.home.y, frame.home.width, frame.home.height].every(
        Number.isFinite,
      )
    )
      return;
    const area = displayUnion(),
      b = widget!.getBounds();
    if (overlayArea !== JSON.stringify(area)) {
      overlay?.setBounds(area);
      overlayArea = JSON.stringify(area);
    }
    // macOS can clamp the drawing window below the menu bar. Use its actual
    // content origin rather than the requested desktop origin at every scale.
    const drawing = overlay!.getContentBounds();
    overlay?.webContents.send("desktop-overlay", {
      ...frame,
      home: {
        ...frame.home,
        x: (b.x - drawing.x) / widgetScale + frame.home.x,
        y: (b.y - drawing.y) / widgetScale + frame.home.y,
      },
    });
    if (!overlay?.isVisible()) {
      overlay?.showInactive();
      event("overlay-started", frame.kind);
    }
  });
  powerMonitor.on("suspend", () => {
    suspended = true;
    stopPursuit();
    chase?.hide();
    overlay?.hide();
    captured = false;
  });
  powerMonitor.on("resume", () => {
    suspended = false;
    keepVisible();
    tick();
  });
  powerMonitor.on("lock-screen", () => {
    suspended = true;
    stopPursuit();
    chase?.hide();
    overlay?.hide();
  });
  powerMonitor.on("unlock-screen", () => {
    suspended = false;
    tick();
  });
  screen.on("display-removed", keepVisible);
  screen.on("display-metrics-changed", keepVisible);
  app.on("activate", () => showBoard());
  app.on("before-quit", () => {
    quitting = true;
    clearInterval(hostTimer);
    stopPursuit();
    tray?.destroy();
  });
  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
  keepVisible();
  if (!testMode) {
    board.once("ready-to-show", () => board?.show());
    widget.once("ready-to-show", showWidget);
  }
  hostTimer = setInterval(tick, 500);
  tick();
  event("ready", {
    arch: process.arch,
    data,
    windows: BrowserWindow.getAllWindows().length,
  });
}
function changed() {
  send("desktop-change");
  tick();
}
function tick() {
  if (suspended) {
    stopPursuit();
    return;
  }
  const now = Date.now(),
    f = repository.friends,
    s = repository.tasks;
  const reduced =
    s.settings.reducedMotion ||
    systemPreferences.getAnimationSettings().prefersReducedMotion;
  const cue = engine.tick(s, f, now, reduced);
  const key = cue ? cue.id + ":" + cue.phase + ":" + cue.startedAt : "";
  if (key && key !== lastCue) {
    repository.command(
      {
        type: "reminded",
        id: cue!.id,
        phase: cue!.phase,
        interval: f.interval,
      },
      now,
    );
    send("desktop-change");
    event("cue", cue);
  }
  lastCue = key;
  if (now >= chatUntil) status.chat = null;
  if (
    !cue &&
    !isQuiet(s, now) &&
    f.enabled &&
    f.autoChat &&
    now >= nextChat &&
    now >= chatUntil
  ) {
    const m = f.members.find((m) => m.id === f.currentId);
    if (m) {
      status.chat = {
        memberId: m.id,
        text: companionLine(
          m,
          "chat",
          s.tasks.find((t) => t.completedAt === null && !t.cancelledAt),
          now,
        ),
      };
      chatUntil = now + 5500;
      nextChat = now + f.chatSeconds * 1000;
    }
  }
  if (isQuiet(s, now)) status.chat = null;
  status = { ...status, cue, reduced };
  const encoded = JSON.stringify(status);
  if (encoded !== lastStatus) {
    send("desktop-status", status);
    lastStatus = encoded;
  }
  if (cue?.chase) {
    if (!mouseTimer) {
      followCursor();
      mouseTimer = setInterval(followCursor, 16);
    }
    if (!chase?.isVisible()) {
      chase?.showInactive();
      event("chase-shown");
    }
  } else {
    stopPursuit();
    if (chase?.isVisible()) {
      chase.hide();
      event("chase-hidden");
    }
  }
}

function stopPursuit() {
  if (mouseTimer) clearInterval(mouseTimer);
  mouseTimer = undefined;
  pursuit = undefined;
  pursuitDisplay = undefined;
  lastPursuitFrame = lastPursuitPaint = 0;
  lastPursuitPose = "";
}
function followCursor() {
  if (!status.cue?.chase || suspended || !chase) return;
  const p = screen.getCursorScreenPoint(),
    display = screen.getDisplayNearestPoint(p),
    b = chase.getBounds(),
    now = performance.now();
  if (!pursuit || pursuitDisplay !== display.id) {
    pursuit = new CursorPursuit();
    pursuitDisplay = display.id;
    lastPursuitFrame = now;
  }
  const pose = pursuit.step(
    p,
    display.workArea,
    b,
    (now - lastPursuitFrame) / 1000,
  );
  lastPursuitFrame = now;
  if (pose.x !== b.x || pose.y !== b.y) chase.setPosition(pose.x, pose.y);
  const paintedPose = `${pose.lean.toFixed(2)}:${pose.stride.toFixed(2)}`;
  if (paintedPose !== lastPursuitPose && now - lastPursuitPaint >= 32) {
    chase.webContents.send("desktop-pursuit", {
      lean: pose.lean,
      stride: pose.stride,
    });
    lastPursuitPaint = now;
    lastPursuitPose = paintedPose;
  }
}
