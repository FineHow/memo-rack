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
await mkdir("outputs/companion-upgrade-20261121/evidence", { recursive: true });
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
    "companion page ready",
  );
  const click = async (text, selector = "button") => {
    const target = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.getClientRects().length && b.textContent.includes(${JSON.stringify(text)})&&!b.matches(':disabled'))`;
    await until(target, `enabled control: ${text}`);
    return evaluate(`${target}.click()`);
  };
  const fill = async (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await until("document.querySelector('.companion-edit input')?.value==='小猫'", "bundled cat selected");
  const steps = () => evaluate("Array.from(document.querySelectorAll('.flow-step-heading>span'),e=>e.textContent)");
  assert.deepEqual(await steps(), ["01","02","03"]);
  assert.equal(await evaluate("document.querySelector('select:has(option[value=mirror])').value"),"mirror");
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.relief-options input'),e=>e.checked)"),[false,true]);
  assert.equal(await evaluate("!!document.querySelector('.preview-task')"),false,"empty preview has no memo");
  const aligned=await evaluate("(()=>{const row=document.querySelector('.phrase-group .check-line'),box=row.querySelector('input').getBoundingClientRect(),label=document.createRange();label.selectNodeContents(row.lastChild);const t=label.getBoundingClientRect();return Math.abs(t.top+t.height/2-box.top-box.height/2)<4 && t.left>=box.right})()");
  assert.ok(aligned,"chat checkbox aligns horizontally with its own label");
  await capture("companion-starter.png");
  await click("移除好友");
  await click("确认移除","[role=dialog] button");
  await until("!document.querySelector('.companion-edit input')","empty crew");
  assert.deepEqual(await steps(), ["01","02","03"]);
  await click("取消修改");
  await until("document.querySelector('.companion-edit input')?.value==='小猫'","restore saved crew");
  await fill(".companion-edit input", "阿杰");
  for (const [i, line] of [
    "在呢",
    "快到时间啦",
    "快上班",
    "做完啦",
  ].entries()) {
    await evaluate(
      `(()=>{const e=document.querySelectorAll('.dialogue-fields textarea')[${i}];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(line)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  }
  await evaluate("document.querySelector('.companion-page .friend-hanging button').click()");
  await until("document.querySelector('.companion-page .friend-bubble')?.textContent==='在呢'","click speaks chat line");
  await click("移除好友");
  await until(
    "document.querySelector('[role=dialog]')",
    "in-app remove confirmation",
  );
  await click("取消", "[role=dialog] button");
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.dialogue-fields textarea').length",
    ),
    4,
  );
  await click("添加一句");
  await evaluate(`(()=>{const e=document.querySelector('textarea[aria-label="平时聊天第2句"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'一起加油');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click("关闭全部玩法");
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.relief-options input'),e=>e.checked)"),[false,false]);
  const toggleGame=async text=>evaluate(`Array.from(document.querySelectorAll('.relief-options label')).find(l=>l.textContent.includes(${JSON.stringify(text)})).querySelector('input').click()`);
  await toggleGame("重拍搭子");await toggleGame("拉绳弹飞");
  const artCenter=await evaluate(`(()=>{const e=document.querySelector('.preview-column .rig-art');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+80,y:r.y+80};})()`);
  const pointer=(type,x,y,buttons)=>call("Input.dispatchMouseEvent",{type,x,y,button:"left",buttons,clickCount:1});
  await pointer("mousePressed",artCenter.x,artCenter.y,1);
  await pointer("mouseMoved",artCenter.x-100,artCenter.y+110,1);
  await until("document.querySelectorAll('.rig-overlay circle').length===5","long pull shows aim dots");
  await pointer("mouseReleased",artCenter.x-100,artCenter.y+110,0);
  await until("document.querySelector('.rig-overlay .soaring')","sling detaches and flies");
  await until("(()=>{const e=document.querySelector('.rig-overlay .rig-art');if(!e)return false;const r=e.getBoundingClientRect();return r.bottom<0||r.top>innerHeight||r.left>innerWidth||r.right<0;})()","sling clears a viewport edge");
  assert.ok(await evaluate("performance.getEntriesByName(location.origin+'/brand/sling-whoosh.wav').length>0"),"launch loads the local whoosh");
  await until("!document.querySelector('.rig-overlay')","sling returns to its slot");
  // Both gestures stay enabled throughout this pull and tap.
  await pointer("mousePressed",artCenter.x,artCenter.y,1);
  await pointer("mouseReleased",artCenter.x,artCenter.y,0);
  await until("document.querySelector('.rig-overlay .smacked')","tap creates impact");
  await until("(()=>{const e=document.querySelector('.rig-overlay .smacked');return e && Number(e.style.transform.match(/rotate\\(([0-9.]+)/)?.[1])>=360;})()","heavy tap completes a full turn");
  await until("!document.querySelector('.rig-overlay')","tap settles");

  const selectFile = async (selector, file = "tests/fixtures/photos/astronaut.png") => {
    const doc = await call("DOM.getDocument");
    const node = await call("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });
    await call("DOM.setFileInputFiles", {
      nodeId: node.nodeId,
      files: [path.resolve(file)],
    });
  };
  await click("编辑照片与造型");
  assert.deepEqual(
    await evaluate(
      "Array.from(document.querySelectorAll('.photo-editor .task-tabs button'),b=>b.textContent)",
    ),
    ["陪伴小人", "照片卡"],
  );
  await until("document.querySelector('.photo canvas')?.width===400 && !document.querySelector('.photo-editor [role=status]')","cat in photo card");
  await click("陪伴小人",".photo-editor .task-tabs button");
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.doll-options button'),b=>b.textContent)"),["棒球衫员工","小猫","自定义模板"]);
  await click("小猫",".doll-options button");
  await until("document.querySelector('.companion-art-preview .doll-photo>img')?.naturalWidth===400 && !document.querySelector('.doll-face')","intact cat until a face is uploaded");
  await selectFile(".photo-editor input[type=file]");
  await until(
    "document.querySelector('.doll-face canvas')?.width===400",
    "portrait in the face opening",
  );
  await until("document.querySelector('.doll-photo clipPath') && !!document.querySelector('.doll-face canvas')","cat frame has a shaped opening");
  const setRange=async(label,value)=>evaluate(`(()=>{const e=document.querySelector('input[aria-label="'+${JSON.stringify(label)}+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(${value}));e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate("document.querySelector('.face-proportions summary').click()");
  const pixels=()=>evaluate("document.querySelector('.doll-face canvas').toDataURL()");
  const originalPixels=await pixels();await setRange("脸部宽度",1.18);await setRange("脸部高度",.89);
  assert.notEqual(await pixels(),originalPixels,"face axes change the applied pixels");
  await click("使用这个造型");
  await until("!document.querySelector('.photo-editor')","cat confirmed");
  await click("保存并上架");
  await until("document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')","cat saved");
  await click("编辑照片与造型");
  await until("document.querySelector('.doll-face canvas')?.width===400 && !document.querySelector('.photo-editor [role=status]')","cat reloaded");
  assert.deepEqual(await evaluate("['脸部宽度','脸部高度'].map(t=>document.querySelector('input[aria-label='+t+']').value)"),["1.18","0.89"]);
  await evaluate("document.querySelector('.face-proportions summary').click()");
  await click("恢复原比例");assert.equal(await pixels(),originalPixels);
  await setRange("缩放",4.5);
  await setRange("脸部宽度",1.06);
  const faceBox=await evaluate("(()=>{const r=document.querySelector('.doll-face canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()");
  await pointer("mousePressed",faceBox.x,faceBox.y,1);
  await pointer("mouseMoved",faceBox.x+faceBox.w*.31,faceBox.y+faceBox.h*1.42,1);
  await pointer("mouseReleased",faceBox.x+faceBox.w*.31,faceBox.y+faceBox.h*1.42,0);
  await capture("cat-face-fit.png");
  await click("棒球衫员工",".doll-options button");
  await until("!document.querySelector('.photo-editor [role=status]')","replacement loaded");
  await click("照片卡", ".photo-editor .task-tabs button");
  await until(
    "document.querySelector('.companion-art-preview.photo canvas')?.width===512",
    "full photo on card",
  );
  await click("自动抠图");
  await until(
    "!document.querySelector('.photo-editor [role=status]')",
    "local model finishes",
  );
  const counts = await evaluate(
    `(()=>{const c=document.querySelector('.photo canvas'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let clear=0,opaque=0;for(let i=3;i<d.length;i+=4){if(d[i]<20)clear++;if(d[i]>220)opaque++;}return {clear,opaque};})()`,
  );
  assert.ok(counts.clear > 1000 && counts.opaque > 1000);
  await click("使用这个造型");
  await until("!document.querySelector('[role=dialog]')", "confirm card");
  await click("保存并上架");
  await until(
    "document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')",
    "saved card",
  );
  await click("预览超时追逐");
  await until(
    "document.querySelector('[data-chase=photo] .chase-mirror>img')?.naturalWidth===512",
    "card follows as a photo",
  );
  await click("结束预览");
  await click("编辑照片与造型");
  await until(
    "document.querySelector('.companion-art-preview.photo canvas')",
    "reopened card",
  );
  await click("使用原图");
  await until(
    "!document.querySelector('.photo-editor [role=status]')",
    "original restored",
  );
  await click("陪伴小人", ".photo-editor .task-tabs button");
  await click("使用这个造型");
  await until("!document.querySelector('[role=dialog]')", "confirm doll");
  await click("保存并上架");
  await until(
    "document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')",
    "saved doll",
  );
  await evaluate(
    `document.querySelector('.companion-stage[aria-label="完整挂架预览"]').scrollIntoView({block:'center'})`,
  );
  await capture("doll-mounted.png");
  await evaluate(
    `document.querySelector('.companion-page .page-heading').scrollIntoView({block:'start'})`,
  );
  await capture("companion-spacing-desktop.png");
  const desktopSpacing = await evaluate(
    `(()=>{const e=document.querySelector('.companion-setup-grid'),r=e.getBoundingClientRect();return{gap:getComputedStyle(e).columnGap,width:r.width,statusFont:getComputedStyle(document.querySelector('.companion-save-state')).fontSize,helperFont:getComputedStyle(document.querySelector('.flow-step-heading p')).fontSize};})()`,
  );
  assert.ok(parseFloat(desktopSpacing.gap) >= 24);
  assert.ok(parseFloat(desktopSpacing.helperFont) >= 12);

  await evaluate("(()=>{const e=document.querySelector('select:has(option[value=swing])');e.value='swing';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await click("预览临期提醒");
  await until(`document.querySelector('.near-swing')`, "near swing on rack");
  assert.equal(await evaluate("document.querySelector('.companion-page .friend-bubble').textContent"),"快到时间啦");
  await capture("near-swing.png");
  assert.equal(
    await evaluate(`!!document.querySelector('[data-chase]')`),
    false,
  );
  await click("结束预览");
  await evaluate(
    `(()=>{const e=document.querySelector('select:has(option[value=mirror])');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'mirror');e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await click("预览临期提醒");
  await until(`document.querySelector('.near-mirror')`, "near mirror");
  await capture("near-mirror.png");
  await click("结束预览");
  await click("预览超时追逐");
  await until(
    "document.querySelector('[data-chase=doll] .doll-face img')?.naturalWidth>0",
    "full doll follows",
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.chase-mirror')).animationName",
    ),
    "friend-mirror",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.friend-bubble').childElementCount",
    ),
    0,
  );
  assert.equal(await evaluate("document.querySelector('[data-chase] .friend-bubble').textContent"),"快上班");
  await wait(6500);
  assert.ok(
    await evaluate("!!document.querySelector('[data-chase]')"),
    "overdue preview outlasts old timeout",
  );
  await click("结束预览");
  await until("!document.querySelector('[data-chase]')", "preview cleared");
  await click("添加好友");
  await fill(".companion-edit input", "上司 B");
  await click("保存并上架");
  await until(
    `document.querySelectorAll('.member-library button').length===2`,
    "second independent member",
  );
  await evaluate(
    `document.querySelectorAll('.member-library button')[0].click()`,
  );
  await until(
    `document.querySelector('.companion-edit input')?.value==='阿杰'`,
    "A identity unchanged",
  );
  await evaluate(
    `document.querySelectorAll('.member-library button')[1].click()`,
  );
  await until(
    `document.querySelector('.companion-edit input')?.value==='上司 B'`,
    "B selected without changing current",
  );
  await capture("member-switch.png");
  await click("添加好友");
  await fill(".companion-edit input", "搭子 C");
  await click("保存并上架");
  await until(
    `document.querySelectorAll('.member-library button').length===3 && !document.querySelector('.draft-badge')`,
    "three independent members",
  );

  assert.ok(
    await evaluate(
      `document.querySelector('.companion-page .companion-stage-heading').textContent.includes('阿杰')`,
    ),
  );
  const lastGrip=await evaluate(`(()=>{const e=document.querySelectorAll('.preview-column .rack-sort-grip')[1];e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await pointer("mousePressed",lastGrip.x,lastGrip.y,1);
  await pointer("mouseMoved",lastGrip.x-176,lastGrip.y,1);
  await pointer("mouseReleased",lastGrip.x-176,lastGrip.y,0);
  await until("document.querySelectorAll('.preview-column .friend-slot .rig-art')[1]?.getAttribute('aria-label')==='搭子 C'","drag hook reorders companions");
  await click("保存并上架");
  await until("!document.querySelector('.draft-badge')","order saved");
  const token = await evaluate(
    `document.querySelector('meta[name="clothesline-native"]').content`,
  );
  const api = async (command) => {
    const r = await fetch(origin + "/api/laundry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clothesline-Token": token,
        Origin: origin,
      },
      body: JSON.stringify(command),
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const savedFriends = await (
    await fetch(origin + "/api/companion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clothesline-Token": token,
        Origin: origin,
      },
      body: JSON.stringify({ action: "read2" }),
    })
  ).json();
  assert.deepEqual(
    savedFriends.members.find((m) => m.name === "阿杰").dialogue,
    {
      chat: ["在呢","一起加油"],
      near: ["快到时间啦"],
      overdue: ["快上班"],
      done: ["做完啦"],
    },
  );
  assert.equal(savedFriends.relief,"both");
  assert.deepEqual(savedFriends.displayedIds.map(id=>savedFriends.members.find(m=>m.id===id).name),["阿杰","搭子 C","上司 B"]);
  const modelSamples = [];
  for (const name of [
    "glasses.jpg",
    "long-hair.jpg",
    "side-complex.jpg",
    "multi-person.png",
  ]) {
    const bytes = await readFile(path.resolve("tests/fixtures/photos", name));
    const upload = await fetch(origin + "/api/companion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clothesline-Token": token,
        Origin: origin,
      },
      body: JSON.stringify({
        action: "asset",
        value:
          "data:image/" +
          (name.endsWith(".png") ? "png" : "jpeg") +
          ";base64," +
          bytes.toString("base64"),
      }),
    });
    assert.equal(upload.status, 200);
    const { ref } = await upload.json();
    const output = await evaluate(
      `new Promise(async(resolve,reject)=>{const bitmap=await createImageBitmap(await(await fetch(${JSON.stringify(ref)})).blob());const wk=new Worker('/matting-worker.js',{type:'module'});wk.onmessage=({data})=>{if(data.error){wk.terminate();reject(Error(data.error));}if(data.alpha){const c=document.createElement('canvas');c.width=data.alpha.width;c.height=data.alpha.height;const ctx=c.getContext('2d');ctx.drawImage(data.alpha,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let opaque=0,clear=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>220)opaque++;if(pixels[i]<20)clear++;}const encoded=c.toDataURL().split(',')[1];resolve({name:${JSON.stringify(name)},width:c.width,height:c.height,opaque,clear,total:pixels.length/4,encoded});wk.terminate();}};wk.onerror=e=>reject(Error(e.message));wk.postMessage({bitmap},[bitmap]);})`,
    );
    assert.ok(
      output.clear > output.total * 0.02 && output.opaque > output.total * 0.02,
      name + " produces a nontrivial mask",
    );
    await writeFile(
      path.resolve(
        "outputs/companion-upgrade-20261121/evidence",
        name + ".mask.png",
      ),
      Buffer.from(output.encoded, "base64"),
    );
    delete output.encoded;
    modelSamples.push(output);
  }
  await writeFile(
    "outputs/companion-upgrade-20261121/model-samples.json",
    JSON.stringify(modelSamples, null, 2),
  );
  for (let i = 0; i < 26; i++)
    await api({
      type: "add",
      id: "fixture-" + i,
      input: {
        title: "回归待办 " + i,
        note: "验证三位好友与完整历史",
        category: "工作",
        color: "sage",
        dueAt: Date.now() + 3600000,
      },
    });
  for (let i = 10; i < 26; i++)
    await api({
      type: i % 3 === 0 ? "cancel" : "complete",
      id: "fixture-" + i,
    });
  await evaluate(
    `document.querySelectorAll('nav[aria-label="主导航"] button')[0].click()`,
  );
  await until(
    `document.querySelectorAll('.orbit-fixture').length===10`,
    "ten tasks remain browsable",
  );
  await capture("home-friend-and-todo.png");
  await evaluate(
    `document.querySelector('.collected-panel').scrollIntoView({block:'center'})`,
  );
  await capture("all-history.png");
  await fill(".collected-panel input", "回归待办 10");
  await until(
    `document.querySelectorAll('.done-row').length===1`,
    "find history beyond original eight",
  );
  await fill(".collected-panel input", "");
  await evaluate(
    `document.querySelector('.task-row .complete-circle').click()`,
  );
  await until(
    `document.querySelector('.undo-completion')`,
    "completion feedback with undo",
  );
  await until("document.querySelector('.board-rack-composition .friend-bubble')?.textContent==='做完啦'","task completion speaks configured reply");
  await capture("completion-feedback.png");
  await click("撤销完成");
  await until(
    `document.querySelectorAll('.orbit-fixture').length===10`,
    "undo restores task",
  );
  await evaluate(
    `document.querySelectorAll('nav[aria-label="主导航"] button')[0].click()`,
  );
  await evaluate(`window.scrollTo(0,0)`);
  await evaluate(
    `document.querySelector('.toast button[aria-label="关闭提示"]')?.click()`,
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(200);
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth<=390`),
    true,
  );
  const friendSpacing = await evaluate(
    "document.querySelectorAll('.board-rack-composition .friend-slot>b,.board-rack-composition .friend-slot>small').length",
  );
  assert.equal(friendSpacing, 0, "no identity captions below companions");
  await capture("friend-mobile.png");
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await wait(100);
  const reducedSpacing = await evaluate(
    "document.querySelector('.board-rack-composition .friend-hanging>button').getBoundingClientRect().width",
  );
  assert.equal(reducedSpacing, 160, "static mode preserves art size");
  await capture("friend-mobile-reduced-motion.png");
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await evaluate(
    `document.querySelectorAll('nav[aria-label="主导航"] button')[1].click()`,
  );
  await evaluate(
    `document.querySelector('.companion-page .page-heading').scrollIntoView({block:'start'})`,
  );
  await wait(100);
  const mobileSpacing = await evaluate(
    `({width:document.documentElement.scrollWidth,gridColumns:getComputedStyle(document.querySelector('.companion-setup-grid')).gridTemplateColumns,helperFont:getComputedStyle(document.querySelector('.flow-step-heading p')).fontSize})`,
  );
  assert.ok(mobileSpacing.width <= 390);
  await capture("companion-spacing-mobile.png");
  await writeFile(
    "outputs/companion-upgrade-20261121/layout-audit.json",
    JSON.stringify(
      { desktopSpacing, mobileSpacing, friendSpacing, reducedSpacing },
      null,
      2,
    ),
  );

  await call("Emulation.setDeviceMetricsOverride", {width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await click("编辑照片与造型");
  await until("!document.querySelector('.photo-editor [role=status]')","loaded source photo");
  await click("陪伴小人",".photo-editor .task-tabs button");
  await click("自定义模板");
  await selectFile("input[aria-label=上传小人模板]");
  await capture("template-step-one.png");
  await click("下一步 · 替换脸部");
  assert.ok(await evaluate("document.querySelector('.wizard-workspace h3').textContent==='圈脸部开口' && !document.querySelector('.template-workshop').innerText.includes('模板自动抠图')"),"can skip cutout and start with the original");
  await click("撤销上一步");
  await click("模板自动抠图");
  await until("!document.querySelector('.photo-editor [role=status]')","template cutout ready");
  assert.equal(await evaluate("!!document.querySelector('.photo-editor .form-error')"),false);
  const canvasPoint=async (x,y)=>evaluate(`(()=>{const c=document.querySelector('.template-canvas');c.scrollIntoView({block:'center',behavior:'instant'});const r=c.getBoundingClientRect();return [r.x+r.width*${x},r.y+r.height*${y}];})()`);
  const midAlpha=()=>evaluate("(()=>{const c=document.querySelector('.template-canvas');return c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]})()");
  const dab=async()=>{const p=await canvasPoint(.5,.5);await pointer("mousePressed",...p,1);await pointer("mouseReleased",...p,0);};
  await click("橡皮擦");
  await dab();
  assert.equal(await midAlpha(),0,"erase clears template pixels");
  await click("恢复画笔");
  await dab();
  assert.ok(await midAlpha()>240,"brush restores original pixels");
  await click("撤销上一步");assert.equal(await midAlpha(),0,"undo restore stroke");
  await click("撤销上一步");assert.ok(await midAlpha()>0,"undo erase stroke");
  await click("下一步 · 替换脸部");
  const opening=[[.34,.13],[.5,.11],[.57,.20],[.54,.33],[.39,.37],[.32,.27],[.34,.13]];
  for(const [i,[x,y]] of opening.entries())await pointer(i?"mouseMoved":"mousePressed",...await canvasPoint(x,y),1);
  await pointer("mouseReleased",...await canvasPoint(.34,.13),0);
  await capture("template-face-opening.png");
  const sampleCanvas = async(x,y)=>evaluate(`(()=>{const c=document.querySelector('.template-canvas');return Array.from(c.getContext('2d').getImageData(Math.round(${x}*c.width),Math.round(${y}*c.height),1,1).data)})()`);
  const brushAt=async(x,y)=>{const p=await canvasPoint(x,y);await pointer("mousePressed",...p,1);await pointer("mouseReleased",...p,0);};
  await click("微调开口");
  await click("擦大开口");const untouched=await sampleCanvas(.57,.18);
  await brushAt(.57,.18);const wider=await sampleCanvas(.57,.18);assert.notDeepEqual(wider,untouched,"opening eraser exposes more face");
  await click("补回边缘");await brushAt(.57,.18);
  assert.deepEqual(await sampleCanvas(.57,.18),untouched,"patch restores template outside original opening");
  await brushAt(.5,.22);
  await click("擦大开口");await brushAt(.57,.18);
  await click("放入照片");
  const beforeFace=await evaluate("document.querySelector('.template-canvas').toDataURL()");
  await selectFile("input[aria-label=上传脸部照片]","tests/fixtures/photos/astronaut.png");
  await until("!document.querySelector('.photo-editor [role=status]')","face uploaded");
  await click("撤销上一步");assert.equal(await evaluate("document.querySelector('.template-canvas').toDataURL()"),beforeFace,"undo restores previous face and alignment");
  await selectFile("input[aria-label=上传脸部照片]","public/brand/starter-cat.jpg");
  await until("!document.querySelector('.photo-editor [role=status]')","face photo loaded");
  await evaluate("document.querySelector('.template-workshop .face-proportions summary').click()");
  await setRange("脸部宽度",1.24);await setRange("脸部高度",.83);
  await capture("custom-template-editor.png");
  await click("使用这个造型");
  await until("!document.querySelector('.photo-editor')","custom template accepted");
  await click("保存并上架");
  await until("document.querySelector('.saved-badge')&&!document.querySelector('.draft-badge')","custom template saved");
  const readCrew=async()=>(await fetch(origin+"/api/companion",{method:"POST",headers:{"Content-Type":"application/json","X-Clothesline-Token":token,Origin:origin},body:JSON.stringify({action:"read2"})})).json();
  const custom=(await readCrew()).members.find(m=>m.template==="uploaded");
  assert.ok(custom?.customDoll.source && custom.customDoll.openingMask && custom.customDoll.cutout && custom.customDoll.opening.length>=5 && custom.result!==custom.working);
  await click("编辑照片与造型");
  await until("document.querySelector('.template-canvas') && !document.querySelector('.photo-editor [role=status]')","reopen saved custom template");
  const compositeMatches=await evaluate(`(async()=>{const c=document.querySelector('.template-canvas'),img=new Image();img.src=${JSON.stringify(custom.result)};await img.decode();const out=document.createElement('canvas');out.width=out.height=c.width;out.getContext('2d').drawImage(img,0,0);return out.toDataURL()===c.toDataURL();})()`);
  assert.ok(compositeMatches,"reopened template, face and placement match saved art");
  await click("编辑脸部开口");await click("微调开口");await click("补回边缘");
  assert.deepEqual(await sampleCanvas(.57,.18),wider,"saved face-mask edits reopen for further brushing");
  await click("放入照片");
  await click("棒球衫员工",".doll-options button");
  await until("(()=>{const c=document.querySelector('.doll-face canvas');return c?.width===400&&c.getContext('2d').getImageData(200,c.height/2,1,1).data[3]>0})()","switching from custom to preset redraws the face");
  await click("自定义模板");
  await until("document.querySelector('.template-canvas')?.getClientRects().length","custom draft remains editable");
  await evaluate("document.querySelector('.photo-editor button[aria-label=关闭弹窗]').click()");
  for(let i=4;i<=7;i++){
    await click("添加好友");
    await fill(".companion-edit input","搭子 "+i);
  }
  await click("保存并上架");
  await until("document.querySelectorAll('.preview-column .friend-slot').length===7 && !document.querySelector('.draft-badge')","seven companions mounted");
  const seventhGrip=await evaluate(`(()=>{const e=[...document.querySelectorAll('.preview-column .rack-sort-grip')].at(-1);e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];})()`);
  await pointer("mousePressed",...seventhGrip,1);await pointer("mouseMoved",seventhGrip[0]-176,seventhGrip[1],1);await pointer("mouseReleased",seventhGrip[0]-176,seventhGrip[1],0);
  await until("document.querySelectorAll('.preview-column .rig-art')[5]?.getAttribute('aria-label')==='搭子 7'","drag beyond old limit");
  await click("保存并上架");await until("!document.querySelector('.draft-badge')","seven saved");
  const expanded=await readCrew();
  assert.equal(expanded.displayedIds.length,7);
  assert.equal(expanded.members.find(m=>m.id===expanded.displayedIds[5]).name,"搭子 7");
  assert.equal(expanded.members.find(m=>m.template==="uploaded").edit.stretchY,.83);
  assert.deepEqual(errors, [], "runtime exceptions");
  console.log(
    "PASS: starter cat, three steps with empty crew, custom cutout, brush repair, face opening and round-trip composite, two sample dolls, original restore, face overlay, persistent mirrored pursuit, dialogue-only bubble, independent member identity, 390px layout",
  );
} finally {
  socket?.close();
  browser?.kill();
  host.kill();
}
