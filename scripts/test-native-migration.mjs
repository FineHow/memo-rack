import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const exe = path.resolve(
  process.env.CLOTHESLINE_TEST_EXE || "desktop/dist/Clothesline.exe",
);
const root = path.resolve("desktop/test-data", `migration-${Date.now()}`);
await mkdir(root, { recursive: true });
const legacy = {
  version: 1,
  tasks: [
    {
      id: "legacy-task",
      title: "旧便签",
      note: "保留完成及截止时间",
      category: "工作",
      color: "sage",
      dueAt: Date.now() + 3600000,
      createdAt: Date.now() - 86400000,
      completedAt: null,
    },
    {
      id: "old-done",
      title: "已完成的旧便签",
      note: "",
      category: "生活",
      color: "blue",
      dueAt: Date.now() - 86400000,
      createdAt: Date.now() - 172800000,
      completedAt: Date.now() - 10000,
    },
  ],
  settings: { urgentMinutes: 15, quiet: false, reducedMotion: false },
};
const preferences = {
  scale: 1,
  companion: true,
  customFace: true,
  template: "varsity",
  speaker: "boss-b",
  motion: "mirror",
  interval: 15,
  reminders: true,
  phrases: ["旧的自定义台词"],
  members: [
    { id: "boss-b", name: "上司 B", template: "mouse" },
    { id: "photo-c", name: "照片 C", template: "custom" },
    { id: "extra-d", name: "库中 D", template: "rabbit" },
  ],
};
const rawTasks = JSON.stringify(legacy),
  rawPrefs = JSON.stringify(preferences);
await writeFile(path.join(root, "tasks-v1.json"), rawTasks);
await writeFile(path.join(root, "widget.json"), rawPrefs);
for (const name of [
  "companion-face.png",
  "wall-boss-b.png",
  "wall-photo-c.png",
  "wall-extra-d.png",
])
  await copyFile(
    "tests/fixtures/photos/head-cutout.png",
    path.join(root, name),
  );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ids;
for (let pass = 0; pass < 2; pass++) {
  const child = spawn(exe, ["--smoke-test"], {
    windowsHide: true,
    env: { ...process.env, CLOTHESLINE_DATA_DIR: root },
  });
  try {
    let state;
    for (let i = 0; i < 80; i++) {
      try {
        state = JSON.parse(
          await readFile(path.join(root, "companions-v2.json"), "utf8"),
        );
        const origin = await readFile(path.join(root, "smoke-url.txt"), "utf8");
        const response = await fetch(origin + "/api/laundry");
        if (!response.ok) throw Error("host not ready");
        break;
      } catch {
        await wait(100);
      }
    }
    assert.ok(state, "migration completes");
    assert.equal(
      state.members.length,
      4,
      "member library is never truncated to display limit",
    );
    assert.equal(state.displayedIds.length, 3);
    assert.equal(state.currentId, "boss-b");
    assert.equal(state.motion, "mirror");
    assert.equal(state.interval, 15);
    assert.deepEqual(
      state.members.find((m) => m.id === state.currentId).phrases,
      ["旧的自定义台词"],
    );
    assert.equal(state.chaseSeconds, 6);
    assert.equal(state.chaseEnabled, true);
    if (pass === 0) ids = state.members.map((m) => m.id);
    else
      assert.deepEqual(
        state.members.map((m) => m.id),
        ids,
        "restart does not duplicate members",
      );
    for (const m of state.members) {
      assert.ok(m.original);
      assert.equal(m.chasePhoto, m.original);
      await access(path.join(root, "assets", path.basename(m.original)));
    }
    const tasks = JSON.parse(
      await readFile(path.join(root, "tasks-v2.json"), "utf8"),
    );
    assert.equal(tasks.version, 2);
    assert.equal(tasks.tasks[0].dueAt, legacy.tasks[0].dueAt);
    assert.equal(tasks.tasks[1].completedAt, legacy.tasks[1].completedAt);
    assert.equal(tasks.settings.urgentMinutes, 15);
    assert.equal(
      await readFile(path.join(root, "tasks-v1.json"), "utf8"),
      rawTasks,
    );
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
}
const corrupted = path.join(root, "corrupted");
await mkdir(corrupted);
const broken = "{broken-but-must-be-preserved";
await writeFile(path.join(corrupted, "tasks-v2.json"), broken);
const self = spawn(exe, ["--self-test"], {
  windowsHide: true,
  env: { ...process.env, CLOTHESLINE_TEST_DIR: corrupted },
});
assert.equal(
  await new Promise((resolve) => self.once("exit", resolve)),
  1,
  "corrupted data is rejected",
);
assert.equal(
  await readFile(path.join(corrupted, "tasks-v2.json"), "utf8"),
  broken,
  "corrupted source is retained",
);
console.log(
  "PASS: v1 tasks, completed records, four members/photos, effective speaker, legal interval/motion preserved; v2 pursuit independent; migration idempotent; corrupted task file never overwritten",
);
