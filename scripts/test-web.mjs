import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve("desktop/test-data", `browser-${Date.now()}-${process.pid}`);
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
      }, 8000);
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
    for (let i = 0; i < 60; i++) {
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
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: origin });
  await until(
    `document.querySelector('.demo-offer button') && !document.querySelector('.page-heading .primary').disabled`,
    "hydration and native connection",
  );
  assert.equal(await evaluate("!!document.querySelector('.studio-nav .studio-mark-button')"),false);
  await evaluate("document.querySelector('.producer-footer button').click()");
  await until("document.querySelector('.studio-dialog .studio-sheet')","studio footer");
  assert.equal(await evaluate("document.querySelector('.studio-site').href"),"https://xiangsuwuxian.gulu9832.xyz/");
  await until("document.querySelectorAll('.channel-card img').length===6 && [...document.querySelectorAll('.channel-card img')].every(e=>e.naturalWidth>0)", "three account cards and three platform logos");
  await capture("studio-details-cards.png");
  for (const [index, platform] of ["微信公众号", "小红书", "抖音"].entries()) {
    await evaluate(`document.querySelectorAll('.channel-links button')[${index}].click()`);
    await until(`document.querySelector('.channel-original')?.alt === '${platform}完整账号卡' && document.querySelector('.channel-original').naturalWidth>0`, platform + " original card");
    await evaluate("document.querySelector('.channel-back').click()");
    await until(`document.activeElement === document.querySelectorAll('.channel-links button')[${index}]`, "restore focus");
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.querySelector('.studio-dialog').scrollWidth <= document.querySelector('.studio-dialog').clientWidth"), true);
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('.studio-dialog button[aria-label=关闭弹窗]').click()");
  await evaluate("document.querySelector('button[aria-label=使用说明]').click()");
  await until("document.querySelector('.help-dialog .help-steps') && document.querySelector('.help-dialog .studio-sheet')","help includes instructions and studio");
  await evaluate("document.querySelector('.help-dialog button[aria-label=关闭弹窗]').click()");
  await evaluate("document.querySelector('button[aria-label=便签架设置]').click()");
  await evaluate("[...document.querySelectorAll('.modal button')].find(b=>b.textContent.includes('今日安静')).click()");
  await evaluate("document.querySelector('.modal button[aria-label=关闭弹窗]').click()");
  await until("document.querySelector('.quiet-notice button')","quiet mode gets its own action row");
  assert.equal(await evaluate("document.querySelector('.quiet-notice').innerText.match(/恢复提醒/g).length"),1);
  await evaluate("document.querySelector('.quiet-notice button').click()");
  await until("!document.querySelector('.quiet-notice')","quiet row clears after restore");
  assert.equal(await evaluate("document.querySelectorAll('.orbit-fixture').length"),0,"empty rod contains no placeholder note");
  await evaluate(
    `Array.from(document.querySelectorAll('.demo-offer button')).find(b=>b.textContent.includes('体验一下')).click()`,
  );
  await until(
    `document.querySelectorAll('.orbit-fixture').length === 4`,
    "four demo clothes",
  );
  const loadsStill =
    "Array.from(document.querySelectorAll('.orbit-load')).every(el => !el.style.transform)";
  await until(loadsStill, "stationary before drag");
  const mouse = (type, x, y, buttons) =>
    call("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: type === "mouseMoved" ? "none" : "left",
      buttons,
      clickCount: 1,
    });
  const orbitDrag = async () => {
    await evaluate(
      "document.querySelector('.orbit-scene').scrollIntoView({block:'center',behavior:'instant'})",
    );
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    const { x, y } = await evaluate(
      `(() => { const r=document.querySelector('.orbit-scene').getBoundingClientRect(); return {x:r.x+r.width*.5,y:r.y+12}; })()`,
    );
    await mouse("mousePressed", x, y, 1);
    for (let i = 1; i <= 8; i++) {
      await mouse("mouseMoved", x + 12 * i, y + 4 * i, 1);
      await wait(17);
    }
    await mouse("mouseReleased", x + 96, y + 32, 0);
  };
  const camera =
    "getComputedStyle(document.querySelector('.orbit-world')).transform";
  const before = await evaluate(camera);
  await orbitDrag();
  assert.equal(await evaluate(camera), before);
  await until(`!(${loadsStill})`, "drag produces wind");
  await until(loadsStill, "swing and twist settle after release");
  assert.equal(
    await evaluate("!!document.querySelector('[role=dialog]')"),
    false,
    "drag did not open task",
  );

  await capture("laundry-dashboard.png");
  await evaluate(`document.querySelector('.page-heading .primary').click()`);
  await until(`document.querySelector('[role="dialog"] input')`, "task form");
  await evaluate(
    `(() => { const el = document.querySelector('[role="dialog"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '桌面同步测试'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await evaluate(
    `document.querySelector('[role="dialog"] form').requestSubmit()`,
  );
  await until(
    `!document.querySelector('[role="dialog"]') && document.querySelectorAll('.orbit-fixture').length === 5`,
    "task saved",
  );
  let state = await (await fetch(`${origin}/api/laundry`)).json();
  assert.equal(
    state.tasks.find((t) => t.title === "桌面同步测试")?.completedAt,
    null,
  );
  const noteSelector = '.orbit-item[aria-label*="桌面同步测试"] .memo-paper';
  await evaluate(
    `document.querySelector('${noteSelector}').scrollIntoView({block:'center',behavior:'instant'})`,
  );
  await evaluate(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  const grab = await evaluate(
    `(()=>{const r=document.querySelector('${noteSelector}').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.6}})()`,
  );
  await mouse("mouseMoved", grab.x, grab.y, 0);
  await until(
    `getComputedStyle(document.querySelector('${noteSelector}')).transform!=="none"`,
    "paper lifts on hover",
  );
  await mouse("mousePressed", grab.x, grab.y, 1);
  await mouse("mouseMoved", grab.x - 40, grab.y + 15, 1);
  await until(
    'document.querySelector(".loose-memo") && !document.querySelector(".memo-basket").hidden',
    "whole sheet and basket appear",
  );
  const target = await evaluate(
    `(()=>{const b=document.querySelector('.memo-basket').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`,
  );
  await mouse("mouseMoved", target.x, target.y, 1);
  await mouse("mouseReleased", target.x, target.y, 0);
  await wait(350);
  assert.equal(
    await evaluate('!!document.querySelector(".loose-memo")'),
    true,
    "roll remains visible in flight",
  );
  await until(
    `document.querySelectorAll('.orbit-fixture').length === 4 && document.querySelector('.done-row')`,
    "complete removes cloth",
  );
  await call("Page.reload");
  await until(
    `document.querySelectorAll('.orbit-fixture').length === 4 && document.querySelector('button[aria-label="重新挂起：桌面同步测试"]')`,
    "completion survives reload",
  );
  await evaluate(
    `document.querySelector('button[aria-label="重新挂起：桌面同步测试"]').click()`,
  );
  await until(
    `document.querySelector('[aria-label="恢复任务"]')`,
    "restore confirmation",
  );
  await evaluate(
    `Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.includes("确认恢复")).click()`,
  );
  await until(
    `document.querySelectorAll('.orbit-fixture').length === 5`,
    "restore cloth",
  );
  await evaluate(
    `document.querySelector('button[aria-label="便签架设置"]').click()`,
  );
  await until(
    `document.querySelector('[role="dialog"] input[type="checkbox"]')`,
    "settings modal",
  );
  await evaluate(
    `document.querySelectorAll('[role="dialog"] input[type="checkbox"]')[1].click()`,
  );
  await until(
    'document.querySelector(".orbit-stage")?.hasAttribute("data-reduced")',
    "saved motion preference",
  );
  const reducedState = await (await fetch(`${origin}/api/laundry`)).json();
  assert.equal(
    reducedState.settings.reducedMotion,
    true,
    "reduced motion reaches native host",
  );
  await evaluate(
    `document.querySelector('button[aria-label="关闭弹窗"]').click()`,
  );
  const cameraBeforeReducedDrag = await evaluate(camera);
  await orbitDrag();
  assert.equal(await evaluate(camera), cameraBeforeReducedDrag);
  assert.equal(
    await evaluate(loadsStill),
    true,
    "reduced motion keeps the load stationary during navigation",
  );
  assert.equal(
    await evaluate(
      `Array.from(document.querySelectorAll('nav[aria-label="主导航"] button')).some(b=>b.textContent.includes("数据分析"))`,
    ),
    false,
    "account analytics is separate from the companion product",
  );
  await evaluate(
    `Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes("陪伴模式")).click()`,
  );
  await until(
    `document.querySelector('.companion-page .primary:not(:disabled)')`,
    "companion editor",
  );
  await evaluate(
    `document.querySelector('.companion-page .page-heading .primary').click()`,
  );
  await until(
    `document.querySelector('.companion-edit input')`,
    "new friend draft",
  );
  await evaluate(
    `(()=>{const e=document.querySelector('.companion-edit input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'好友 A');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await evaluate(
    `(()=>{const e=document.querySelector('.reminder-preferences input[type=checkbox]');if(!e.checked)e.click();})()`,
  );
  await evaluate(`document.querySelector('.editor-save .primary').click()`);
  await until(
    `document.querySelector('.companion-page .saved-badge') && !document.querySelector('.companion-page .draft-badge') && document.querySelector('.editor-save .primary').disabled`,
    "friend committed",
  );
  await capture("companion-dashboard.png");

  await evaluate(
    `document.querySelectorAll('nav[aria-label="主导航"] button')[0].click()`,
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(200);
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth <= 390`),
    true,
    "mobile horizontal overflow",
  );
  await capture("laundry-mobile.png");
  assert.deepEqual(errors, [], "runtime errors");
  console.log(
    "PASS: hydration, demo, drag-driven wind and damping, add, native data sync, complete, reload, restore, reduced motion, account analytics excluded, mobile layout, no runtime exceptions",
  );
  console.log(
    "Screenshots: screenshots/laundry-dashboard.png, companion-dashboard.png, laundry-mobile.png",
  );
} finally {
  socket?.close();
  browser?.kill();
  host.kill();
}
