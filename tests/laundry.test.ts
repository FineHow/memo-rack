import { describe, expect, it } from "vitest";
import {
  applyCommand,
  countdown,
  categoryLabel,
  EMPTY_LAUNDRY,
  urgency,
  validateState,
  type TaskInput,
} from "@/lib/laundry";

const now = Date.UTC(2026, 10, 12, 8);
const input: TaskInput = {
  title: "交付剪辑",
  note: "检查字幕",
  category: "工作",
  color: "sage",
  dueAt: now + 3600000,
};
const fresh = () =>
  applyCommand(EMPTY_LAUNDRY, { type: "add", id: "task-1", input }, now);

describe("晾衣架待办", () => {
  it("保留原有拍纸卡片的英文分类", () => {
    expect(["工作", "生活", "灵感", "健康"].map(categoryLabel)).toEqual([
      "WORK",
      "LIFE",
      "IDEAS",
      "HEALTH",
    ]);
  });
  it("截止时间始终按真实时间计算，睡眠或关闭之后不会重置", () => {
    const task = fresh().tasks[0];
    expect(urgency(task, now, 15)).toBe("soon");
    expect(urgency(task, now + 45 * 60000, 15)).toBe("urgent");
    expect(urgency(task, input.dueAt, 15)).toBe("overdue");
    expect(countdown(input.dueAt, now)).toBe("01:00:00");
    expect(countdown(input.dueAt, now + 3900000)).toBe("已超时 00:05:00");
  });
  it("只有标记完成才收衣；恢复后保留原截止时间", () => {
    const initial = fresh();
    const done = applyCommand(
      initial,
      { type: "complete", id: "task-1" },
      now + 1000,
    );
    expect(done.tasks[0].completedAt).toBe(now + 1000);
    const repeated = applyCommand(
      done,
      { type: "complete", id: "task-1" },
      now + 2000,
    );
    expect(repeated.tasks[0].completedAt).toBe(now + 1000);
    expect(
      applyCommand(done, { type: "restore", id: "task-1" }).tasks[0],
    ).toMatchObject(initial.tasks[0]);
    expect(initial.tasks[0].completedAt).toBeNull();
  });
  it("拒绝删除操作、无效截止时间和重复编号", () => {
    expect(() =>
      applyCommand(fresh(), { type: "delete", id: "task-1" } as never),
    ).toThrow();
    expect(() =>
      applyCommand(
        EMPTY_LAUNDRY,
        { type: "add", id: "past", input: { ...input, dueAt: now } },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyCommand(fresh(), { type: "add", id: "task-1", input }, now),
    ).toThrow();
    expect(() =>
      validateState({
        ...fresh(),
        tasks: [{ ...fresh().tasks[0], dueAt: NaN }],
      }),
    ).toThrow();
  });
  it("编辑不会隐式完成待办，完成后禁止编辑", () => {
    const updated = applyCommand(fresh(), {
      type: "update",
      id: "task-1",
      input: { ...input, title: "交付视频" },
    });
    expect(updated.tasks[0].completedAt).toBeNull();
    const done = applyCommand(updated, { type: "complete", id: "task-1" });
    expect(() =>
      applyCommand(done, { type: "update", id: "task-1", input }),
    ).toThrow();
  });
  it("示例需要显式添加，不能覆盖已有任务", () => {
    expect(EMPTY_LAUNDRY.tasks).toHaveLength(0);
    const demo = applyCommand(EMPTY_LAUNDRY, { type: "demo" }, now);
    expect(demo.tasks).toHaveLength(4);
    expect(demo.tasks.every((t) => t.demo)).toBe(true);
    expect(() => applyCommand(fresh(), { type: "demo" }, now)).toThrow();
  });
  it("设置及持久化数据需要校验，安静模式保留截止时间", () => {
    const state = applyCommand(fresh(), {
      type: "settings",
      input: { urgentMinutes: 5, quiet: true, reducedMotion: true },
    });
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(state.tasks[0].dueAt).toBe(input.dueAt);
    expect(() => validateState({ ...state, version: 3 })).toThrow();
    expect(() =>
      applyCommand(state, {
        type: "settings",
        input: { ...state.settings, urgentMinutes: -1 },
      }),
    ).toThrow();
  });
});
