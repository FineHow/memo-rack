import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { CursorPursuit } = require("../dist/pursuit.cjs");
const area = { x: 0, y: 30, width: 1600, height: 1000 },
  size = { width: 270, height: 300 };
const chase = new CursorPursuit();
let pose = chase.step({ x: 200, y: 300 }, area, size, 0);
assert.deepEqual([pose.x, pose.y], [230, 328]);
const target = { x: 800, y: 450 };
pose = chase.step(target, area, size, 1 / 60);
assert.ok(
  pose.x > 230 && pose.x < 250,
  "must accelerate instead of teleporting",
);
for (let i = 0; i < 120; i++) pose = chase.step(target, area, size, 1 / 60);
assert.deepEqual([pose.x, pose.y, pose.stride], [830, 478, 0]);
console.log("PASS: 追赶具有延迟与加速，鼠标停下后收敛且不抖动");

const turn = new CursorPursuit();
turn.step({ x: 200, y: 300 }, area, size, 0);
for (let i = 0; i < 12; i++) turn.step(target, area, size, 1 / 60);
assert.ok(turn.vx > 0);
const before = turn.x;
turn.step({ x: 100, y: 300 }, area, size, 1 / 60);
assert.ok(turn.x > before, "turning preserves momentum before braking");
for (let i = 0; i < 120; i++)
  pose = turn.step({ x: 100, y: 300 }, area, size, 1 / 60);
assert.equal(pose.x, 130);
console.log("PASS: 突然反向会先刹车再追赶，最终抵达新目标");

const edge = new CursorPursuit();
edge.step({ x: 1200, y: 300 }, area, size, 0);
let prior = edge.x;
for (const x of [1320, 1310, 1330, 1300, 1340]) {
  pose = edge.step({ x, y: 980 }, area, size, 1 / 60);
  assert.ok(
    Math.abs(edge.x - prior) < 35,
    "changing target sides must remain continuous",
  );
  assert.ok(pose.x >= 0 && pose.x <= 1330 && pose.y >= 30 && pose.y <= 730);
  prior = edge.x;
}
const negative = new CursorPursuit();
for (let i = 0; i < 300; i++) {
  pose = negative.step(
    { x: -1500 + (i % 2) * 1400, y: -600 + (i % 3) * 300 },
    { x: -1600, y: -700, width: 1600, height: 1000 },
    size,
    i % 2 ? 2 : 1 / 120,
  );
  assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
  assert.ok(pose.x >= -1600 && pose.x <= -270 && pose.y >= -700 && pose.y <= 0);
  assert.ok(Math.hypot(negative.vx, negative.vy) <= 1800.01);
}
console.log("PASS: 边缘换侧连续、负坐标与延迟帧保持有界，不会飞离可用屏幕");
