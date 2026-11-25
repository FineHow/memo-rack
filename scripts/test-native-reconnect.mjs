import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(
  "desktop/test-data",
  `browser-${Date.now()}-${process.pid}`,
);
const profile = path.join(root, "profile");
await mkdir(profile, { recursive: true });
await mkdir("screenshots", { recursive: true });
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
    for (let i = 0; i < 300; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await wait(100);
    }
    throw new Error(`UI assertion failed: ${description}`);
  };
  const capture = async (name) => {
    const shot = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(
      path.resolve("screenshots", name),
      Buffer.from(shot.data, "base64"),
    );
  };

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Page.navigate", { url: origin + "/#companions" });
  await until(
    `document.querySelector('.companion-page .page-heading .primary:not(:disabled)')`,
    "ready",
  );
  const click = (label, selector = "button") =>
    evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`,
    );
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await click("添加好友");
  await fill(".companion-edit input", "连接 A");
  await click("保存并上架");
  await until(
    `document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')`,
    "saved",
  );
  await evaluate(
    `window.__fetch=window.fetch;window.fetch=(url,...args)=>String(url).startsWith('/api/')?Promise.reject(new TypeError('simulated disconnect')):window.__fetch(url,...args)`,
  );
  await until(
    `document.querySelector('.companion-page .form-error')?.textContent.includes('断开')`,
    "disconnect visible",
  );
  await evaluate(`window.fetch=window.__fetch`);
  await until(
    `!document.querySelector('.companion-page .form-error')&&!document.querySelector('.storage-error')`,
    "unchanged revision clears disconnected state automatically",
  );
  await evaluate(
    `window.fetch=(url,...args)=>String(url).startsWith('/api/')?Promise.reject(new TypeError('simulated disconnect')):window.__fetch(url,...args)`,
  );
  await until(
    `document.querySelector('.companion-page .form-error')?.textContent.includes('断开')`,
    "second disconnect",
  );
  await fill(".companion-edit input", "重连后的 A");
  await click("保存并上架");
  await until(
    `document.querySelector('.companion-page .form-error')?.textContent.includes('重试读取')`,
    "disconnected draft protected",
  );
  await capture("native-disconnect-recovery.png");
  await evaluate(`window.fetch=window.__fetch`);
  await click("重试读取", ".companion-page .form-error button");
  await until(
    `!document.querySelector('.companion-page .form-error')`,
    "retry read completes",
  );
  await click("保存并上架");
  await until(
    `document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')`,
    "draft retries after reconnect",
  );
  await until(
    `!document.querySelector('.storage-error')`,
    "task channel reconnected",
  );
  await evaluate(
    `window.__heldReady=false;window.fetch=async(url,options)=>{const response=await window.__fetch(url,options);if(String(url)==='/api/laundry'&&!options?.method&&!window.__heldReady){window.__heldReady=true;return new Promise(resolve=>window.__releaseRead=()=>resolve(response));}return response;}`,
  );
  await until(`window.__heldReady`, "old polling response held");
  await evaluate(
    `document.querySelectorAll('nav[aria-label="主导航"] button')[0].click()`,
  );
  await until(
    `document.querySelector('.rack-panel')&&!document.querySelector('.companion-page')`,
    "board navigation complete",
  );
  await evaluate(`document.querySelector('.page-heading .primary').click()`);
  await until(`document.querySelector('[role=dialog] form')`, "task form");
  await fill("[role=dialog] input", "晚到读取不覆盖新任务");
  await evaluate(
    `document.querySelector('[role=dialog] form').requestSubmit()`,
  );
  await until(`document.querySelector('.task-row')`, "task committed");
  await evaluate(`window.__releaseRead();window.fetch=window.__fetch`);
  await wait(100);
  assert.equal(
    await evaluate(`document.querySelectorAll('.task-row').length`),
    1,
    "late GET cannot overwrite committed POST",
  );
  const preload = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__initialFailure=true;const initialFetch=window.fetch;window.fetch=(url,...args)=>window.__initialFailure&&String(url).startsWith('/api/')?Promise.reject(new TypeError('initial disconnected')):initialFetch(url,...args);`,
  });
  await call("Page.reload");
  await until(
    `document.querySelector('.storage-error')&&document.querySelector('.companion-page .form-error')`,
    "initial read failure visible",
  );
  await evaluate(`window.__initialFailure=false`);
  await click("重试读取", ".storage-error button");
  await until(
    `!document.querySelector('.storage-error')`,
    "task store initial retry",
  );
  await click("重试读取", ".companion-page .form-error button");
  await until(
    `!document.querySelector('.companion-page .form-error')`,
    "companion store initial retry",
  );
  const token = await evaluate(
    `document.querySelector('meta[name="clothesline-native"]').content`,
  );
  const inserted = await fetch(origin + "/api/laundry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Clothesline-Token": token,
      Origin: origin,
    },
    body: JSON.stringify({
      type: "add",
      id: "after-initial-recovery",
      input: {
        title: "恢复后持续同步",
        note: "",
        category: "工作",
        color: "sage",
        dueAt: Date.now() + 3600000,
      },
    }),
  });
  assert.equal(inserted.status, 200);
  await until(
    `document.querySelector('nav .nav-count')?.textContent==='2'`,
    "polling subscribed after initial failure retry",
  );
  await call("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: preload.identifier,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: disconnect protects draft, unchanged-revision reconnect clears errors, retry succeeds, delayed stale GET does not overwrite a newer task write",
  );
} finally {
  socket?.close();
  browser?.kill();
  host.kill();
}
