import { spawn } from "node:child_process";
import { readFile, mkdir, access, copyFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const exe = path.resolve(
  process.env.CLOTHESLINE_TEST_EXE ?? "desktop/dist/Clothesline.exe",
);
const root = path.resolve("desktop/test-data", String(Date.now()));
await mkdir(root, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (args) =>
  spawn(exe, args, {
    windowsHide: true,
    env: {
      ...process.env,
      CLOTHESLINE_DATA_DIR: root,
      CLOTHESLINE_TEST_DIR: root,
    },
  });
const self = run(["--self-test"]);
assert.equal(await new Promise((resolve) => self.on("exit", resolve)), 0);
const result = await readFile(path.join(root, "self-test-result.txt"), "utf8");
assert.match(result, /PASS/);
console.log(result);
const child = run(["--smoke-test"]);
try {
  let origin;
  for (let i = 0; i < 100; i++) {
    try {
      origin = await readFile(path.join(root, "smoke-url.txt"), "utf8");
      break;
    } catch {
      await wait(100);
    }
  }
  assert.ok(origin, "Desktop host did not start");
  const html = await (await fetch(origin)).text();
  const token = html.match(
    /name="clothesline-native" content="([a-f0-9]+)"/,
  )?.[1];
  assert.ok(token, "Dashboard bridge token missing");
  assert.match(html, /晾一晾/);
  const report = await fetch(`${origin}/reports/accounts.html`);
  assert.equal(report.status, 404, "unrelated account report is not shipped");
  assert.doesNotMatch(html, /数据分析|账号数据分析/);
  const request = (command, sentToken = token, sentOrigin = origin) =>
    fetch(`${origin}/api/laundry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clothesline-Token": sentToken,
        Origin: sentOrigin,
      },
      body: JSON.stringify(command),
    });
  assert.equal((await request({ type: "demo" }, "invalid")).status, 403);
  assert.equal(
    (await request({ type: "demo" }, token, "https://example.com")).status,
    403,
  );
  const initial = await (await fetch(`${origin}/api/laundry`)).json();
  assert.equal(initial.tasks.length, 1);
  assert.equal(
    (await request({ type: "complete", id: "native-test" })).status,
    200,
  );
  assert.equal((await request({ type: "demo" })).status, 200);
  const state = await (await fetch(`${origin}/api/laundry`)).json();
  assert.equal(state.tasks.filter((t) => t.completedAt === null).length, 4);
  assert.equal(
    (await request({ type: "delete", id: state.tasks[1].id })).status,
    400,
  );
  const stored = JSON.parse(
    await readFile(path.join(root, "tasks-v2.json"), "utf8"),
  );
  assert.equal(stored.tasks.length, 5);
  const companion = (action, value, key = token) =>
    fetch(`${origin}/api/companion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clothesline-Token": key,
        Origin: origin,
      },
      body: JSON.stringify({ action, value }),
    });
  const change = async (action, value) => {
    const response = await companion(action, value);
    assert.equal(response.status, 200, action);
    return response.json();
  };
  assert.equal((await companion("read", "", "invalid")).status, 403);
  const pref = await change("read2");
  assert.equal(pref.version, 2);
  const png =
    "data:image/png;base64," +
    (await readFile("public/brand/rice.png")).toString("base64");
  const asset = (await change("asset", png)).ref;
  assert.match(asset, /^\/assets\/[a-f0-9]{64}\.png$/);
  assert.equal((await fetch(origin + asset)).status, 200);
  const member = {
    id: "friend-a",
    name: "好友 A",
    mode: "photo",
    template: "varsity",
    original: asset,
    result: asset,
    chasePhoto: asset,
    edit: {
      zoom: 1,
      x: 0,
      y: 0,
      rotation: 0,
      ratio: "original",
      frame: "plain",
      anchor: 0.16,
      headX: 0,
      headY: 0,
      headScale: 1,
    },
    tone: "gentle",
    phrases: [],
    phraseMode: "mixed",
  };
  const first = await change(
    "save2",
    JSON.stringify({
      ...pref,
      members: [member, { ...member, id: "boss-b", name: "上司 B" }],
      currentId: "friend-a",
      displayedIds: ["friend-a", "boss-b"],
      enabled: true,
    }),
  );
  assert.equal(first.members.length, 2);
  assert.equal(
    (await companion("save2", JSON.stringify(pref))).status,
    400,
    "stale save rejected",
  );
  assert.equal((await change("read2")).members[1].name, "上司 B");
  const id = state.tasks[1].id,
    dueAt = state.tasks[1].dueAt;
  assert.equal((await request({ type: "snooze", id })).status, 200);
  const snoozed = await (await fetch(origin + "/api/laundry")).json();
  assert.equal(snoozed.tasks.find((t) => t.id === id).dueAt, dueAt);
  assert.ok(snoozed.tasks.find((t) => t.id === id).snoozedUntil > Date.now());
  await request({ type: "cancel", id });
  const cancelled = await (await fetch(origin + "/api/laundry")).json();
  assert.equal(cancelled.tasks.find((t) => t.id === id).completedAt, null);
  assert.ok(cancelled.tasks.find((t) => t.id === id).cancelledAt);
  await request({ type: "restore", id });
  await wait(5500);
  await access(path.join(root, "native-preview.png"));
  await mkdir("screenshots", { recursive: true });
  await copyFile(
    path.join(root, "native-preview.png"),
    "screenshots/companion-rack.png",
  );
  console.log(
    "PASS: native window, dashboard, account report excluded, shared tasks, invalid token, foreign origin, rejected deletion, persistent JSON, rendered preview",
  );
  console.log(`Preview: ${path.join(root, "native-preview.png")}`);
} finally {
  child.kill();
}
