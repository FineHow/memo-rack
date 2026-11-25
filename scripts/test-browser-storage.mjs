import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(
  "desktop/test-data",
  `browser-${Date.now()}-${process.pid}`,
);
const profile = path.join(root, "profile");
await mkdir(profile, { recursive: true });
await mkdir("screenshots", { recursive: true });
const webRoot = path.resolve(process.env.CLOTHESLINE_WEB_ROOT || "out");
const host = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(
      webRoot,
      "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(webRoot + path.sep)) throw Error("invalid path");
    const mime = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".wasm": "application/wasm",
      ".png": "image/png",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + host.address().port;
let browser, socket;
try {
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
  await call("Page.navigate", { url: origin + "/#companions" });
  await until(
    `document.querySelector('.companion-page .page-heading .primary:not(:disabled)')`,
    "standalone companion ready",
  );
  const click = (label, selector = "button") =>
    evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`,
    );
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  const saved = () =>
    until(
      `document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')&&document.querySelector('.editor-save .primary').disabled`,
      "committed metadata",
    );
  await until('document.querySelector(".companion-edit input")?.value==="小猫"', "starter card");
  await fill(".companion-edit input", "存储 A");
  await click("编辑照片与造型");
  await until('!document.querySelector(".photo-editor [role=status]")', "starter photo loaded");
  await click("照片卡", ".photo-editor .task-tabs button");
  const doc = await call("DOM.getDocument"),
    node = await call("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: ".photo-editor input[type=file]",
    });
  await call("DOM.setFileInputFiles", {
    nodeId: node.nodeId,
    files: [path.resolve("tests/fixtures/photos/transparent.png")],
  });
  await until(
    `document.querySelector('.photo canvas')?.width===480 && Array.from(document.querySelectorAll('.photo-editor button')).find(b=>b.textContent.includes('使用这个造型'))?.disabled===false`,
    "transparent PNG editable",
  );
  await click("使用这个造型");
  await until(
    `!document.querySelector('[role=dialog]')`,
    "confirmed transparent PNG",
  );
  await click("保存并上架");
  await saved();
  assert.equal(
    await evaluate(
      `JSON.stringify(JSON.parse(localStorage.getItem('memo-rack-companion-v2'))).includes('data:image')`,
    ),
    false,
    "photos are blob references",
  );
  const blobs = await evaluate(
    `new Promise((resolve,reject)=>{const r=indexedDB.open('clothesline-photos-v2');r.onsuccess=()=>{const q=r.result.transaction('assets').objectStore('assets').getAll();q.onsuccess=()=>{resolve({count:q.result.length,allBlobs:q.result.every(x=>x instanceof Blob)});r.result.close();};q.onerror=reject;};r.onerror=reject;})`,
  );
  assert.ok(blobs.count >= 1 && blobs.allBlobs);
  const intact = await evaluate(
    `localStorage.getItem('memo-rack-companion-v2')`,
  );
  await evaluate(
    `window.__transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')throw new DOMException('full','QuotaExceededError');return window.__transaction.call(this,names,mode,...args);}`,
  );
  await click("编辑照片与造型");
  await until("document.querySelector('.photo canvas')", "saved photo ready");
  const d2 = await call("DOM.getDocument"),
    n2 = await call("DOM.querySelector", {
      nodeId: d2.root.nodeId,
      selector: ".photo-editor input[type=file]",
    });
  await call("DOM.setFileInputFiles", {
    nodeId: n2.nodeId,
    files: [path.resolve("tests/fixtures/photos/astronaut.png")],
  });
  await until(
    "document.querySelector('.photo canvas')?.width===512",
    "replacement ready",
  );
  await click("使用这个造型");
  await until(
    `document.querySelector('.photo-editor .form-error')`,
    "IndexedDB failure visible",
  );
  assert.equal(
    await evaluate(`localStorage.getItem('memo-rack-companion-v2')`),
    intact,
    "failed photo never commits metadata",
  );
  await click("取消", ".photo-editor .modal-actions button");
  await evaluate(`IDBDatabase.prototype.transaction=window.__transaction`);
  await evaluate(
    `window.__missingRef=JSON.parse(localStorage.getItem('memo-rack-companion-v2')).members[0].original`,
  );
  await evaluate(
    `new Promise((resolve,reject)=>{const r=indexedDB.open('clothesline-photos-v2');r.onsuccess=()=>{const db=r.result,t=db.transaction('assets','readwrite'),s=t.objectStore('assets'),g=s.get(window.__missingRef);g.onsuccess=()=>{window.__missingBlob=g.result;s.delete(window.__missingRef);};t.oncomplete=()=>{db.close();resolve();};t.onerror=reject;};})`,
  );
  await fill(".companion-edit input", "缺失素材不应保存");
  await click("保存并上架");
  await until(
    `document.querySelector('.form-error')?.textContent.includes('素材缺失')`,
    "missing blob rejected before commit",
  );
  assert.equal(
    await evaluate(`localStorage.getItem('memo-rack-companion-v2')`),
    intact,
  );
  await evaluate(
    `new Promise((resolve,reject)=>{const r=indexedDB.open('clothesline-photos-v2');r.onsuccess=()=>{const db=r.result,t=db.transaction('assets','readwrite');t.objectStore('assets').put(window.__missingBlob,window.__missingRef);t.oncomplete=()=>{db.close();resolve();};t.onerror=reject;};})`,
  );
  await click("取消修改");
  await fill(".companion-edit input", "存储 A2");
  await click("保存并上架");
  await saved();
  const beforeQuota = await evaluate(
    `localStorage.getItem('memo-rack-companion-v2')`,
  );
  await evaluate(
    `window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('memo-rack-companion-v2'))throw new DOMException('full','QuotaExceededError');return window.__setItem.call(this,k,v);}`,
  );
  await fill(".companion-edit input", "不应保存");
  await click("保存并上架");
  await until(
    `document.querySelector('.form-error')?.textContent.includes('空间不足')`,
    "quota error explained",
  );
  assert.equal(
    await evaluate(`localStorage.getItem('memo-rack-companion-v2')`),
    beforeQuota,
  );
  await evaluate(`Storage.prototype.setItem=window.__setItem`);
  await click("保存并上架");
  await saved();
  await evaluate(
    `void(window.__secondary=window.open(location.origin+'/#companions'))`,
  );
  await until(
    `window.__secondary?.document.querySelector('.companion-edit input')?.value==='不应保存'`,
    "real second tab initialized",
  );
  await fill(".companion-edit input", "父窗口草稿");
  await evaluate(
    `(()=>{const w=window.__secondary,e=w.document.querySelector('.companion-edit input');Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(e,'另一窗口保存');e.dispatchEvent(new w.Event('input',{bubbles:true}));})()`,
  );
  await evaluate(
    `window.__secondary.document.querySelector('.editor-save .primary').click()`,
  );
  await until(
    `JSON.parse(localStorage.getItem('memo-rack-companion-v2')).members[0].name==='另一窗口保存'`,
    "second tab saves",
  );
  await click("保存并上架");
  await until(
    `document.querySelector('.form-error')?.textContent.includes('另一个窗口')`,
    "stale draft is rejected",
  );
  await click("取消修改");
  await until(
    `document.querySelector('.companion-edit input')?.value==='另一窗口保存'`,
    "cancel reads committed other-tab data",
  );
  await evaluate(`window.__secondary.close()`);
  await evaluate(
    `window.__raw=localStorage.getItem('memo-rack-companion-v2');localStorage.setItem('memo-rack-companion-v2','{broken')`,
  );
  await call("Page.reload");
  await until(
    `document.querySelector('.companion-page .form-error')`,
    "corrupt metadata reported",
  );
  assert.equal(
    await evaluate(`localStorage.getItem('memo-rack-companion-v2')`),
    "{broken",
    "corrupt source retained",
  );
  await evaluate(`window.confirm=()=>{throw Error("unexpected browser dialog")}`);
  await click("恢复搭子备份");
  await click("确认恢复", "[role=dialog] button");
  await until(
    `document.querySelector('.companion-edit input') && !document.querySelector('.companion-page .form-error')`,
    "explicit backup recovery",
  );
  assert.ok(
    await evaluate(
      `Object.keys(localStorage).some(k=>k.startsWith('memo-rack-companion-v2-rejected-'))`,
    ),
  );
  await capture("browser-storage-recovery.png");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: standalone IndexedDB Blob photos, transparent PNG, quota failure retains committed data and retries, real two-tab conflict, corrupt metadata retained, explicit backup recovery",
  );
} finally {
  socket?.close();
  browser?.kill();
  await new Promise((resolve) => host.close(resolve));
}
