import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(
  "desktop/test-data",
  `browser-${Date.now()}-${process.pid}`,
);
const profile = path.join(root, "profile");
await mkdir(profile, { recursive: true });
const host = spawn(
  path.resolve(
    process.env.CLOTHESLINE_TEST_EXE ?? "desktop/dist/Clothesline.exe",
  ),
  ["--smoke-test"],
  { windowsHide: true, env: { ...process.env, CLOTHESLINE_DATA_DIR: root } },
);
let browser, socket;
try {
  let origin;
  for (let i = 0; i < 80; i++) {
    try {
      origin = await readFile(path.join(root, "smoke-url.txt"), "utf8");
      break;
    } catch {
      await wait(100);
    }
  }
  assert.ok(origin);
  const executable =
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number(
        (
          await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0],
      );
      break;
    } catch {
      await wait(100);
    }
  }
  assert.ok(port, "Headless Chrome failed to start");
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const page = pages.find((p) => p.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.text);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timeout);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const seq = ++id;
      const timeout = setTimeout(() => {
        pending.delete(seq);
        reject(new Error(`CDP timeout: ${method}`));
      }, 120000);
      pending.set(seq, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id: seq, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    return result.result?.value;
  };
  const until = async (expression, description) => {
    for (let i = 0; i < 1200; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await wait(100);
    }
    throw new Error(`UI assertion failed: ${description}`);
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: origin + "/#companions" });
  await until(
    `document.querySelector('.companion-page .page-heading .primary:not(:disabled)')`,
    "ready",
  );
  const click = (label, selector = "button") =>
    evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`,
    );
  await click("添加好友", ".companion-page button");
  await click("编辑照片与造型");
  await click("照片卡", ".photo-editor .task-tabs button");
  const doc = await call("DOM.getDocument"),
    node = await call("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: ".photo-editor input[type=file]",
    });
  await call("DOM.setFileInputFiles", {
    nodeId: node.nodeId,
    files: [path.resolve("tests/fixtures/photos/side-complex.jpg")],
  });
  await until(
    "document.querySelector('.photo canvas')?.width===1280",
    "complex photo loaded",
  );
  const original = await evaluate(
    "document.querySelector('.photo canvas').toDataURL()",
  );
  await click("自动抠图");
  await until(
    "!document.querySelector('.photo-editor [role=status]')",
    "matting finished",
  );
  assert.notEqual(
    await evaluate("document.querySelector('.photo canvas').toDataURL()"),
    original,
  );
  await click("使用原图");
  await until(
    "!document.querySelector('.photo-editor [role=status]')",
    "restored",
  );
  assert.equal(
    await evaluate("document.querySelector('.photo canvas').toDataURL()"),
    original,
  );
  assert.deepEqual(errors, []);
  console.log("PASS: original restored pixel-for-pixel after local matting");
} finally {
  socket?.close();
  browser?.kill();
  host.kill();
}
