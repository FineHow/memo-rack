import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";
import executablePath from "electron";
import "./test-pursuit.mjs";
const mac = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { Repository, ReminderEngine } = require("../dist/core.cjs");
const results = path.join(mac, "test-results", String(Date.now()));
await fs.mkdir(results, { recursive: true });
const checks = [],
  errors = [];
const record = (name, detail) => {
  checks.push({ name, detail });
  console.log("PASS:", name);
};
const repo = new Repository(path.join(results, "core"));
const input = {
  title: "原型测试任务",
  note: "本地隔离测试",
  category: "工作",
  color: "sage",
  dueAt: 2000000,
};
repo.command({ type: "add", id: "a", input }, 1000000);
repo.command({ type: "add", id: "b", input }, 1000000);
const engine = new ReminderEngine();
let cue = engine.tick(repo.tasks, repo.friends, 2000000);
assert.equal(cue.id, "a");
repo.command(
  { type: "reminded", id: "a", phase: "overdue", interval: 60 },
  2000000,
);
cue = engine.tick(repo.tasks, repo.friends, 2060001);
assert.equal(cue.id, "b");
repo.command({ type: "snooze", id: "b" }, 2060002);
assert.notEqual(engine.tick(repo.tasks, repo.friends, 2060003)?.id, "b");
assert.equal(
  new Repository(path.join(results, "core")).tasks.tasks[1].snoozedUntil,
  2660002,
);
record("持久化、单一追逐队列轮转、稍后立即退出");
const env = { ...process.env, CLOTHESLINE_DATA_DIR: path.join(results, "app") };
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.env.CLOTHESLINE_TEST_APP;
const application = await electron.launch({
  executablePath: packaged || executablePath,
  args: packaged ? ["--prototype-test"] : [mac, "--prototype-test"],
  env,
  timeout: 30000,
});
try {
  application.on("window", (page) =>
    page.on("pageerror", (e) => errors.push(e.message)),
  );
  const locate = async (surface) => {
    for (let i = 0; i < 100; i++) {
      for (const p of application.windows())
        if (
          (await p
            .evaluate(() => window.clotheslineDesktop?.surface)
            .catch(() => null)) === surface
        )
          return p;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("missing " + surface);
  };
  const board = await locate("board"),
    widget = await locate("widget"),
    overlay = await locate("overlay"),
    chase = await locate("chase");
  for (const p of [board, widget, overlay, chase])
    p.on("pageerror", (e) => errors.push(e.message));
  await board.locator(".app-shell").waitFor();
  await widget.locator(".rig-art").waitFor();
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL() === "app://bundle/")
      ?.show(),
  );
  assert.equal(await board.locator("h1").first().textContent(), "待办工作台");
  const native = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      url: w.webContents.getURL(),
      frame: w.getBounds(),
      transparent: w.isAlwaysOnTop(),
      focusable: w.isFocusable(),
    })),
  );
  record("四个真实 Electron 窗口、原看板、透明挂件入口", native);
  const centered = await widget.locator(".anchored-rig").evaluate((el) => {
    const rig = el.getBoundingClientRect(),
      rail = document.querySelector(".orbit-world").getBoundingClientRect();
    return Math.abs(rig.x + rig.width / 2 - (rail.x + rail.width / 2));
  });
  assert.ok(centered < 1, `idle companion is off-center by ${centered}px`);
  record("无待办时挂件陪伴角色与晾衣杆居中");
  const toolbar = widget.locator(".desktop-toolbar");
  await widget.screenshot({
    path: path.join(results, "widget-idle.png"),
    omitBackground: true,
  });
  assert.equal(
    await toolbar.evaluate((el) => getComputedStyle(el).opacity),
    "0",
  );
  await widget.evaluate(() => window.clotheslineDesktop.widget("show"));
  const rail = await widget.locator(".orbit-world").boundingBox();
  await widget.mouse.move(rail.x + rail.width / 2, rail.y + 8);
  await widget.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".desktop-toolbar")).opacity ===
      "1",
  );
  await widget.getByRole("button", { name: "晾一晾便签", exact: true }).hover();
  await widget.screenshot({
    path: path.join(results, "widget-toolbar.png"),
    omitBackground: true,
  });
  assert.equal(
    await toolbar.evaluate((el) => getComputedStyle(el).pointerEvents),
    "auto",
  );
  await widget.mouse.move(-30, -30);
  await widget.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".desktop-toolbar")).opacity ===
      "0",
  );
  assert.equal(
    await toolbar.evaluate((el) => getComputedStyle(el).pointerEvents),
    "none",
  );
  record("工具栏默认隐藏、移入杆显示、移入工具栏保持、移出隐藏且不拦截点击");
  const zoomState = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({
        url: w.webContents.getURL(),
        zoom: w.webContents.getZoomFactor(),
        bounds: w.getBounds(),
      })),
    );
  const zoomKey = (key, shift = false) =>
    application.evaluate(
      ({ BrowserWindow }, { key, shift }) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().endsWith("/widget"),
        );
        const modifiers = shift ? ["meta", "shift"] : ["meta"];
        w.webContents.sendInputEvent({
          type: "keyDown",
          keyCode: key,
          modifiers,
        });
        w.webContents.sendInputEvent({
          type: "keyUp",
          keyCode: key,
          modifiers,
        });
      },
      { key, shift },
    );
  // Exercise the real native keyboard path; neither IPC nor DOM handlers synthesize zoom.
  await application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("/widget"),
    );
    w.show();
    w.focus();
  });
  await zoomKey("=");
  let sizes = await zoomState();
  const enlarged = sizes.find((w) => w.url.endsWith("/widget"));
  assert.ok(Math.abs(enlarged.zoom - 1.1) < 0.001, JSON.stringify(sizes));
  assert.ok(
    enlarged.bounds.width >
      native.find((w) => w.url.endsWith("/widget")).frame.width,
  );
  assert.equal(sizes.find((w) => w.url === "app://bundle/").zoom, 1);
  assert.ok(
    Math.abs(sizes.find((w) => w.url.endsWith("/overlay")).zoom - 1.1) < 0.001,
  );
  await zoomKey("-");
  assert.ok(
    Math.abs(
      (await zoomState()).find((w) => w.url.endsWith("/widget")).zoom - 1,
    ) < 0.001,
  );
  await zoomKey("+", true);
  assert.ok(
    Math.abs(
      (await zoomState()).find((w) => w.url.endsWith("/widget")).zoom - 1.1,
    ) < 0.001,
  );
  await zoomKey("0");
  assert.ok(
    Math.abs(
      (await zoomState()).find((w) => w.url.endsWith("/widget")).zoom - 1,
    ) < 0.001,
  );
  // Run all the existing cross-window gestures at a non-default scale.
  await zoomKey("-");
  sizes = await zoomState();
  assert.ok(
    Math.abs(sizes.find((w) => w.url.endsWith("/widget")).zoom - 0.9) < 0.001,
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(results, "app/widget-macos.json")))
      .scale,
    0.9,
  );
  record(
    "Command + / = / - / 0 实际快捷键、窗口同步缩放、看板不受影响及缩放保存",
    sizes,
  );
  assert.equal(
    await toolbar.evaluate((el) => getComputedStyle(el).opacity),
    "0",
  );
  const resources = await board.evaluate(async () => {
    const files = [
      "/brand/starter-cat.jpg",
      "/memo-pads/sage.png",
      "/matting-worker.js",
      "/ort/ort.wasm.min.mjs",
      "/ort/ort-wasm-simd-threaded.wasm",
      "/models/modnet.onnx",
    ];
    return Promise.all(
      files.map(async (file) => {
        const r = await fetch(file);
        return {
          file,
          status: r.status,
          type: r.headers.get("content-type"),
          bytes: (await r.arrayBuffer()).byteLength,
        };
      }),
    );
  });
  assert.ok(resources.every((r) => r.status === 200 && r.bytes > 0));
  record("包内图片、Worker、WASM、25MB 模型路径", resources);
  const inference = await board.evaluate(async () => {
    const bitmap = await createImageBitmap(
      await (await fetch("/brand/starter-cat.jpg")).blob(),
    );
    return new Promise((resolve, reject) => {
      const worker = new Worker("/matting-worker.js", { type: "module" }),
        timer = setTimeout(() => {
          worker.terminate();
          reject(Error("inference timeout"));
        }, 90000);
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        reject(Error(e.message));
      };
      worker.onmessage = ({ data }) => {
        if (data.error) {
          clearTimeout(timer);
          worker.terminate();
          reject(Error(data.error));
        }
        if (data.alpha) {
          const size = { width: data.alpha.width, height: data.alpha.height };
          data.alpha.close();
          clearTimeout(timer);
          worker.terminate();
          resolve(size);
        }
      };
      worker.postMessage({ bitmap }, [bitmap]);
    });
  });
  record("真实 Worker/WASM 本地推理成功", inference);
  await board
    .getByRole("button", { name: "写便签", exact: true })
    .first()
    .click();
  await board
    .getByRole("textbox", { name: "便签标题" })
    .fill("Mac 独立窗口测试");
  await board.getByRole("button", { name: "挂上便签", exact: true }).click();
  await widget.locator(".memo-paper").waitFor();
  const saved = await board.evaluate(() => window.clotheslineDesktop.laundry());
  assert.equal(saved.tasks.length, 1);
  record("原看板表单保存、挂件共享同一 JSON 数据");
  // Local asset transfer uses the same bridge as the unchanged photo editor.
  const photo = await board.evaluate(async () => {
    const b = await (await fetch("/brand/starter-cat.jpg")).blob();
    const url = await new Promise((r) => {
      const f = new FileReader();
      f.onload = () => r(f.result);
      f.readAsDataURL(b);
    });
    return window.clotheslineDesktop.companion("asset", url);
  });
  assert.match(photo.ref, /^\/assets\/[a-f0-9]{64}\.jpg$/);
  assert.equal(
    await board.evaluate(async (ref) => (await fetch(ref)).status, photo.ref),
    200,
  );
  record("图片上传、SHA-256 落盘及 app 协议读取");
  await widget.evaluate(() => window.clotheslineDesktop.widget("show"));
  await widget.evaluate(() => window.clotheslineDesktop.interact(false));
  await widget.evaluate(() => window.clotheslineDesktop.interact(true));
  const getNative = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({
        url: w.webContents.getURL(),
        visible: w.isVisible(),
        focusable: w.isFocusable(),
        background: w.getBackgroundColor(),
      })),
    );
  const widgetFlags = (await getNative()).find((w) =>
    w.url.endsWith("/widget"),
  );
  assert.equal(
    await widget.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    ),
    "rgba(0, 0, 0, 0)",
  );
  record("原生透明背景及穿透调用（底层应用点击需真机验收）", widgetFlags);
  // Move the rig past the actual small window bounds through its real pointer handlers.
  const art = widget.locator(".rig-art").first(),
    box = await art.boundingBox();
  await widget.mouse.move(box.x + 80, box.y + 80);
  await widget.mouse.down();
  await widget.mouse.move(box.x - 80, box.y + 240, { steps: 12 });
  await overlay.locator(".rig-overlay").waitFor();
  const overlayBounds = await overlay.locator(".rig-art").boundingBox();
  assert.ok(overlayBounds);
  const overlayHome = await overlay.locator(".rig-overlay").boundingBox(),
    widgetHome = await widget.locator(".anchored-rig").first().boundingBox();
  const actualScale = (await zoomState()).find((w) =>
    w.url.endsWith("/widget"),
  ).zoom;
  const alignment = await application.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    return {
      widget: windows
        .find((w) => w.webContents.getURL().endsWith("/widget"))
        .getBounds(),
      overlay: windows
        .find((w) => w.webContents.getURL().endsWith("/overlay"))
        .getBounds(),
    };
  });
  assert.ok(
    Math.abs(
      alignment.overlay.x +
        overlayHome.x * actualScale -
        (alignment.widget.x + widgetHome.x * actualScale),
    ) < 2,
    "scaled overlay must align with the dragged character",
  );
  assert.ok(
    Math.abs(
      alignment.overlay.y +
        overlayHome.y * actualScale -
        (alignment.widget.y + widgetHome.y * actualScale),
    ) < 2,
    JSON.stringify({ alignment, overlayHome, widgetHome, actualScale }),
  );
  record("拉绳时独立原生覆盖窗绘制角色", overlayBounds);
  await widget.mouse.up();
  await overlay.locator(".soaring").waitFor({ timeout: 3000 });
  await overlay
    .locator(".rig-overlay")
    .waitFor({ state: "detached", timeout: 15000 });
  record("人物弹飞、独立覆盖窗播放及自动返回");
  // Tap and paper throw exercise the unchanged input handlers and new native drawing bridge.
  await widget.evaluate(async () => {
    const b = window.clotheslineDesktop;
    const f = await b.companion("read2");
    await b.companion("save2", JSON.stringify({ ...f, relief: "both" }));
  });
  await widget.locator(".rig-art").first().click();
  await overlay.locator(".smacked").waitFor({ timeout: 3000 });
  await overlay
    .locator(".rig-overlay")
    .waitFor({ state: "detached", timeout: 10000 });
  record("重拍原动画在独立窗口播放并返回");
  const memo = widget.locator(".memo-paper").first(),
    paper = await memo.boundingBox();
  await widget.mouse.move(
    paper.x + paper.width / 2,
    paper.y + paper.height / 2,
  );
  await widget.mouse.down();
  await widget.mouse.move(
    paper.x + paper.width / 2,
    paper.y + paper.height + 180,
    { steps: 12 },
  );
  await overlay.locator(".loose-memo").waitFor();
  await widget.mouse.up();
  await overlay
    .locator(".loose-memo")
    .waitFor({ state: "detached", timeout: 10000 });
  assert.ok(
    (await board.evaluate(() => window.clotheslineDesktop.laundry())).tasks[0]
      .completedAt,
  );
  record("便签拖出小窗口、另一窗口播放投篓、恰好完成一次");
  await widget.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".desktop-toolbar")).opacity ===
      "0",
  );
  await board.evaluate(async () => {
    const s = await window.clotheslineDesktop.laundry();
    await window.clotheslineDesktop.laundry({
      type: "restore",
      id: s.tasks[0].id,
    });
  });
  const focusBefore = await application.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id,
  );
  // Use an isolated host's cursor provider; this never moves the user's real cursor.
  const pursuitPoints = await application.evaluate(({ screen }) => {
    const a = screen.getPrimaryDisplay().workArea;
    const first = { x: a.x + Math.round(a.width * 0.2), y: a.y + 150 };
    const second = {
      x: first.x + Math.min(400, Math.round(a.width * 0.25)),
      y: first.y + 80,
    };
    globalThis.testCursor = first;
    globalThis.originalCursor = screen.getCursorScreenPoint;
    screen.getCursorScreenPoint = () => ({ ...globalThis.testCursor });
    return { first, second };
  });
  await board.evaluate(async () => {
    const s = await window.clotheslineDesktop.laundry();
    const t = s.tasks[0];
    await window.clotheslineDesktop.laundry({
      type: "update",
      id: t.id,
      input: { ...t, dueAt: Date.now() - 1000 },
    });
  });
  await chase.locator(".desktop-follower").waitFor();
  assert.equal(
    await application.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id,
    ),
    focusBefore,
  );
  record("追逐出现没有切换原有 Electron 窗口焦点");
  const pursuitSamples = await application.evaluate(
    async ({ BrowserWindow }, points) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("?chase=1"),
      );
      const samples = [
        {
          at: performance.now(),
          position: w.getPosition(),
          focus: BrowserWindow.getFocusedWindow()?.id,
        },
      ];
      globalThis.testCursor = points.second;
      for (let i = 0; i < 70; i++) {
        await new Promise((resolve) => setTimeout(resolve, 16));
        samples.push({
          at: performance.now(),
          position: w.getPosition(),
          focus: BrowserWindow.getFocusedWindow()?.id,
        });
      }
      return samples;
    },
    pursuitPoints,
  );
  const firstX = pursuitSamples[0].position[0],
    finalX = pursuitSamples.at(-1).position[0];
  assert.ok(
    pursuitSamples[1].position[0] - firstX < 80,
    "chase must not snap to the new cursor",
  );
  assert.ok(finalX - firstX > 200, "chase must actually catch up");
  assert.ok(Math.abs(finalX - (pursuitPoints.second.x + 30)) < 3);
  assert.ok(pursuitSamples.every((s) => s.focus === focusBefore));
  assert.equal(
    await chase
      .locator(".desktop-chase-step")
      .evaluate((el) => getComputedStyle(el).animationName),
    "desktop-chase-stride",
  );
  assert.equal(
    await chase
      .locator(".chase-mirror")
      .evaluate((el) => getComputedStyle(el).animationName),
    "friend-mirror",
  );
  await fs.writeFile(
    path.join(results, "pursuit-samples.json"),
    JSON.stringify(pursuitSamples, null, 2),
  );
  await application.evaluate(({ screen }) => {
    screen.getCursorScreenPoint = globalThis.originalCursor;
  });
  record("原生追逐窗连续追赶、缓停、保留镜像与步态，整个移动过程焦点不变");
  assert.equal(
    (await getNative()).find((w) => w.url.includes("?chase=1")).focusable,
    false,
  );
  await widget.evaluate(() => window.clotheslineDesktop.widget("hide"));
  assert.equal(
    (await getNative()).find((w) => w.url.includes("?chase=1")).visible,
    true,
  );
  record(
    "隐藏后持续追逐，原生追逐窗 focusable=false（穿透与外部应用焦点待手工验收）",
  );
  await board.evaluate(async () => {
    const s = await window.clotheslineDesktop.laundry();
    await window.clotheslineDesktop.laundry({
      type: "start",
      id: s.tasks[0].id,
    });
  });
  await chase.locator(".desktop-follower").waitFor({ state: "detached" });
  assert.equal(
    (await getNative()).find((w) => w.url.includes("?chase=1")).visible,
    false,
  );
  record("开始处理立即停止当前追逐");
  await board.screenshot({ path: path.join(results, "board.png") });
  await widget.evaluate(() => window.clotheslineDesktop.widget("show"));
  await widget.screenshot({
    path: path.join(results, "widget.png"),
    omitBackground: true,
  });
  assert.deepEqual(errors, []);
  record("无 renderer 未捕获异常");
} finally {
  await application.close();
  await fs.writeFile(
    path.join(results, "result.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
}
console.log("Results:", results);
const reopened = await electron.launch({
  executablePath: packaged || executablePath,
  args: packaged ? ["--prototype-test"] : [mac, "--prototype-test"],
  env,
  timeout: 30000,
});
try {
  await reopened.firstWindow();
  const restored = await reopened.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter(
        (w) =>
          w.webContents.getURL().endsWith("/widget") ||
          w.webContents.getURL().endsWith("/overlay"),
      )
      .map((w) => w.webContents.getZoomFactor()),
  );
  assert.equal(restored.length, 2);
  assert.ok(restored.every((z) => Math.abs(z - 0.9) < 0.001));
  record("退出并重新打开应用后恢复挂件及动画层缩放", restored);
} finally {
  await reopened.close();
  await fs.writeFile(
    path.join(results, "result.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
}
